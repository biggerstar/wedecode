import { createVM } from "@/utils/create-vm";

function parseParenthesesTyping(str: string): 'single' | 'double' | 'multiple' {
  str = str.trim()
  const sameObject = str.startsWith('{') && str.endsWith('}')
  const sameArray = str.startsWith('[') && str.endsWith(']')
  const hasSpreading = (sameArray || sameObject) && str.includes('...')
  if (sameObject &&
    !hasSpreading &&
    str.split(':').length === 2
  ) {
    // {uuid:uuid}
    return 'single'
  } else if (sameObject || sameArray) {
    // {uuid:uuid, ...val}
    return 'multiple'
  } else {
    return 'double'
  }
}

function restoreSingle(ops: any, withScope = false) {
  if (typeof ops == "undefined") return "";

  function scope(value: string) {
    if (withScope) return value;
    // const typing = parseParenthesesTyping(value);
    // if (typing === 'single') return "{" + value + "}";
    // else if (typing === 'multiple') return "{{(" + value + ")}}";
    // else return "{{" + value + "}}";
    // if (value.includes('cont:cont,mkAppear:mkAppear')) {
    //   console.log("🚀 ~ scope ~ value:", value)
    // }
    if (value.startsWith('{') && value.endsWith('}')) return "{{(" + value + ")}}";
    if (value.startsWith('...')) return "{" + value.substring(3) + "}";
    return "{{" + value + "}}";
  }

  function enBrace(value: string, type = '{') {
    if (value.startsWith('{') ||
      value.startsWith('[') ||
      value.startsWith('(') ||
      value.endsWith('}') ||
      value.endsWith(']') ||
      value.endsWith(')')
    ) {
      value = ' ' + value + ' '
    }
    // console.log(type, value)
    switch (type) {
      case '{':
        return '{' + value + '}';
      case '[':
        return '[' + value + ']';
      case '(':
        return '(' + value + ')';
      default:
        throw Error("Unknown brace type " + type);
    }
  }

  function restoreNext(ops: any, w = withScope) {
    return restoreSingle(ops, w);
  }

  function jsoToWxOn(obj: any) {//convert JS Object to WeChat Object Notation(No quotes@key+str)
    let ans = "";
    if (typeof obj === "undefined") {
      return 'undefined';
    } else if (obj === null) {
      return 'null';
    } else if (obj instanceof RegExp) {
      return obj.toString();
    } else if (obj instanceof Array) {
      for (let i = 0; i < obj.length; i++) ans += ',' + jsoToWxOn(obj[i]);
      return enBrace(ans.slice(1), '[');
    } else if (typeof obj == "object") {
      for (let k in obj) ans += "," + k + ":" + jsoToWxOn(obj[k]);
      return enBrace(ans.slice(1), '{');
    } else if (typeof obj == "string") {
      let parts = obj.split('"'), ret = [];
      for (let part of parts) {
        let atoms = part.split("'"), ans = [];
        for (let atom of atoms) ans.push(JSON.stringify(atom).slice(1, -1));
        ret.push(ans.join("\\'"));
      }
      return "'" + ret.join('"') + "'";
    } else return JSON.stringify(obj);
  }

  let op = ops[0];
  if (!Array.isArray(op)) {
    switch (op) {
      case 3://string
        return ops[1];//may cause problems if wx use it to be string
      case 1://direct value
        const val = jsoToWxOn(ops[1])
        return scope(val);
      case 11://values list, According to var a = 11;
        let ans = "";
        ops.shift();
        for (let perOp of ops) ans += restoreNext(perOp);
        return ans;
    }
  } else {
    let ans: string = "";
    switch (op[0]) {//vop
      case 2://arithmetic operator
        {
          function getPrior(op: number, len: number) {
            const priorList = {
              "?:": 4,
              "&&": 6,
              "||": 5,
              "+": 13,
              "*": 14,
              "/": 14,
              "%": 14,
              "|": 7,
              "^": 8,
              "&": 9,
              "!": 16,
              "~": 16,
              "===": 10,
              "==": 10,
              "!=": 10,
              "!==": 10,
              ">=": 11,
              "<=": 11,
              ">": 11,
              "<": 11,
              "<<": 12,
              ">>": 12,
              "-": len === 3 ? 13 : 16
            };
            return priorList[op] ? priorList[op] : 0;
          }

          function getOp(i: number) {
            let ret = restoreNext(ops[i], true);
            if (ops[i] instanceof Object && typeof ops[i][0] == "object" && ops[i][0][0] === 2) {
              //Add brackets if we need
              if (getPrior(op[1], ops.length) > getPrior(ops[i][0][1], ops[i].length)) ret = enBrace(ret, '(');
            }
            return ret;
          }

          switch (op[1]) {
            case "?:":
              ans = getOp(1) + "?" + getOp(2) + ":" + getOp(3);
              break;
            case "!":
            case "~":
              ans = op[1] + getOp(1);
              break;
            // @ts-ignore
            case "-":
              if (ops.length !== 3) {
                ans = op[1] + getOp(1);
                break;
              }//should not add more in there![fall through] 
            default:
              ans = getOp(1) + op[1] + getOp(2);
          }
          break;
        }
      case 4: // unkown-arrayStart? 将操作符下 数组 拼接数组成字符串形式
        ans = restoreNext(ops[1], true);
        break;
      case 5: // merge-array
        {
          switch (ops.length) {
            case 2:
              ans = enBrace(restoreNext(ops[1], true), '[');
              break;
            case 1:
              ans = '[]';
              break;
            default: {
              let a = restoreNext(ops[1], true);
              //console.log(a,a.startsWith('[')&&a.endsWith(']'));
              if (a.startsWith('[') && a.endsWith(']')) {
                if (a !== '[]') {
                  ans = enBrace(a.slice(1, -1).trim() + ',' + restoreNext(ops[2], true), '[');
                  //console.log('-',a);
                } else {
                  ans = enBrace(restoreNext(ops[2], true), '[');
                }
              } else {
                ans = enBrace('...' + a + ',' + restoreNext(ops[2], true), '[');//may/must not support in fact
              }
            }
          }
          break;
        }
      case 6://get value of an object
        {
          let sonName = restoreNext(ops[2], true);
          if (sonName._type === "var") {
            ans = restoreNext(ops[1], true) + enBrace(sonName, '[');
          } else {
            let attach = "";
            if (/^[A-Za-z\_][A-Za-z\d\_]*$/.test(sonName)/*is a qualified id*/)
              attach = '.' + sonName;
            else attach = enBrace(sonName, '[');
            ans = restoreNext(ops[1], true) + attach;
          }
          break;
        }
      case 7://get value of str
        {
          switch (ops[1][0]) {
            case 11:
              ans = enBrace("__unTestedGetValue:" + enBrace(jsoToWxOn(ops), '['), '{');
              break;
            case 3:
              //@ts-ignore
              ans = new String(ops[1][1]);
              ans['_type'] = "var";
              break;
            default:
              throw Error("Unknown type to get value");
          }
          break;
        }
      case 8://first object
        ans = enBrace(ops[1] + ':' + restoreNext(ops[2], true), '{');//ops[1] have only this way to define
        break;
      case 9://object
        {
          function type(x) {
            if (x.startsWith('...')) return 1;
            if (x.startsWith('{') && x.endsWith('}')) return 0;
            return 2;
          }

          let a = restoreNext(ops[1], true);
          let b = restoreNext(ops[2], true);
          let xa = type(a), xb = type(b);
          if (xa == 2 || xb == 2) ans = enBrace("__unkownMerge:" + enBrace(a + "," + b, '['), '{');
          else {
            if (!xa) a = a.slice(1, -1).trim();
            if (!xb) b = b.slice(1, -1).trim();
            //console.log(l,r);
            ans = enBrace(a + ',' + b, '{');
          }
          break;
        }
      case 10://...object
        ans = '...' + restoreNext(ops[1], true);
        break;
      case 12: {
        let arr = restoreNext(ops[2], true);
        if (arr.startsWith('[') && arr.endsWith(']'))
          ans = restoreNext(ops[1], true) + enBrace(arr.slice(1, -1).trim(), '(');
        else ans = restoreNext(ops[1], true) + '.apply' + enBrace('null,' + arr, '(');
        break;
      }
      default:
        ans = enBrace("__unkownSpecific:" + jsoToWxOn(ops), '{');
    }
    // console.log(ans)
    return scope(<string>ans);
  }
}

function catchZ(code: string, cb: Function) {
  const reg = /function\s+gz\$gwx(\w+)\(\)\{(?:.|\n)*?;return\s+__WXML_GLOBAL__\.ops_cached\.\$gwx[\w\n]+}/g
  const allGwxFunctionMatch = code.match(reg)
  if (!allGwxFunctionMatch) return
  const allFunctionMap = {}
  const zObject = {}
  const vm = createVM({
    sandbox: { __WXML_GLOBAL__: { ops_cached: {} } }
  })
  allGwxFunctionMatch.forEach(funcString => {  // 提取出所有的Z生成函数及其对应gwx函数名称
    const funcReg = /function\s+gz\$gwx(\w*)\(\)/g
    const funcName = funcReg.exec(funcString)?.[1]
    if (!funcName) return
    vm.run(funcString)
    const hookZFunc = vm.sandbox[`gz$gwx${funcName}`]
    if (hookZFunc) {
      allFunctionMap[funcName] = hookZFunc
      zObject[funcName] = hookZFunc()
      zObject[funcName] = zObject[funcName]
        .map((data: any) => {
          if (Array.isArray(data) && data[0] === '11182016' && Array.isArray(data[1])) return data[1]
          return data;
        })
    }
  })
  cb(zObject);
}

export function getZ(code: string, cb: Function) {
  catchZ(code, (z: Record<any, any[]>) => {
    let ans = {}
    for (let gwxFuncName in z) {
      ans[gwxFuncName] = z[gwxFuncName].map(gwxData => restoreSingle(gwxData, false))
    }
    cb(ans)
  });
}
