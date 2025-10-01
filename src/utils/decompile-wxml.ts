/**
 * 本项目遵循 GPL-3.0 开源协议
 * 本段代码引用自 https://github.com/qwerty472123/wxappUnpacker ,并做了一定修改优化
 * */

import esprima from "esprima";
import escodegen from "escodegen";

function analyze(core: any, z: any, namePool: Record<any, any>, xPool: Record<any, any>, fakePool = {}, zMulName = "0") {
  function anaRecursion(core: any, fakePool = {}) {
    return analyze(core, z, namePool, xPool, fakePool, zMulName);
  }

  function push(name: string, elem: any) {
    namePool[name] = elem;
  }

  function pushSon(pname: string, son: any) {
    // console.log(pname, son)
    if (fakePool[pname]) fakePool[pname].son.push(son);
    else namePool[pname].son.push(son);
  }

  for (let ei = 0; ei < core.length; ei++) {
    let e = core[ei];
    switch (e.type) {
      case "ExpressionStatement": {
        let f = e.expression;
        if (f.callee) {
          if (f.callee.type == "Identifier") {
            switch (f.callee.name) {
              case "_r":
                namePool[f.arguments[0].name].v[f.arguments[1].value] = z[f.arguments[2].value];
                break;
              case "_rz":
                namePool[f.arguments[1].name].v[f.arguments[2].value] = z[zMulName][f.arguments[3].value];
                break;
              case "_":   // 标签属性
                // 放入子层级
                pushSon(f.arguments[0].name, namePool[f.arguments[1].name]);
                break;
              case "_2": {
                let item = f.arguments[6].value;//def:item
                let index = f.arguments[7].value;//def:index
                let data = z[f.arguments[0].value];
                let key = escodegen.generate(f.arguments[8]).slice(1, -1);//f.arguments[8].value;//def:""
                let obj = namePool[f.arguments[5].name];
                let gen = namePool[f.arguments[1].name];
                if (gen.tag == "gen") {
                  let ret = gen.func.body.body.pop().argument.name;
                  anaRecursion(gen.func.body.body, {[ret]: obj});
                }
                obj.v["wx:for"] = data;
                if (index != "index") obj.v["wx:for-index"] = index;
                if (item != "item") obj.v["wx:for-item"] = item;
                if (key != "") obj.v["wx:key"] = key;
              }
                break;
              case "_2z": {
                let item = f.arguments[7].value;//def:item
                let index = f.arguments[8].value;//def:index
                let data = z[zMulName][f.arguments[1].value];
                let key = escodegen.generate(f.arguments[9]).slice(1, -1);//f.arguments[9].value;//def:""
                let obj = namePool[f.arguments[6].name];
                let gen = namePool[f.arguments[2].name];
                if (gen.tag == "gen") {
                  let ret = gen.func.body.body.pop().argument.name;
                  anaRecursion(gen.func.body.body, {[ret]: obj});
                }
                obj.v["wx:for"] = data;
                if (index != "index") obj.v["wx:for-index"] = index;
                if (item != "item") obj.v["wx:for-item"] = item;
                if (key != "") obj.v["wx:key"] = key;
              }
                break;
              case "_ic":
                pushSon(f.arguments[5].name, {
                  tag: "include",
                  son: [],
                  v: {src: xPool[f.arguments[0].property.value]}
                });
                break;
              case "_ai": {//template import
                let to = Object.keys(fakePool)[0];
                if (to) pushSon(to, {
                  tag: "import",
                  son: [],
                  v: {src: xPool[f.arguments[1].property.value]}
                });
                else throw Error("Unexpected fake pool");
              }
                break;
              case "_af":
                //ignore _af
                break;
              default:
                throw Error("Unknown expression callee name " + f.callee.name);
            }
          } else if (f.callee.type == "MemberExpression") {
            if (f.callee.object.name == "cs" || f.callee.property.name == "pop") break;
            throw Error("Unknown member expression");
          } else throw Error("Unknown callee type " + f.callee.type);
        } else if (f.type == "AssignmentExpression" && f.operator == "=") {
          //no special use
        } else throw Error("Unknown expression statement.");
        break;
      }
      case "VariableDeclaration":
        for (let dec of e.declarations) {
          if (dec.init.type == "CallExpression") {
            switch (dec.init.callee.name) {
              case "_n":
                let tagName = dec.init.arguments[0].value
                if (['wx-scope'].includes(tagName)) {
                  tagName = 'view'
                }
                push(dec.id.name, {tag: tagName, son: [], v: {}});
                break;
              case "_v":
                push(dec.id.name, {tag: "block", son: [], v: {}});
                break;
              case "_o":
                push(dec.id.name, {
                  tag: "__textNode__",
                  textNode: true,
                  content: z[dec.init.arguments[0].value]
                });
                break;
              case "_oz":
                push(dec.id.name, {
                  tag: "__textNode__",
                  textNode: true,
                  content: z[zMulName][dec.init.arguments[1].value]
                });
                break;
              case "_m": {
                if (dec.init.arguments[2].elements.length > 0) {
                  throw Error("Noticable generics content: " + dec.init.arguments[2].toString());
                }
                let mv = {};
                let name = null, base = 0;
                for (let x of dec.init.arguments[1].elements) {
                  let v = x.value;
                  if (!v && typeof v != "number") {
                    if (x.type == "UnaryExpression" && x.operator == "-") v = -x.argument.value;
                    else throw Error("Unknown type of object in _m attrs array: " + x.type);
                  }
                  if (name === null) {
                    name = v;
                  } else {
                    if (base + v < 0) mv[name] = null; else {
                      mv[name] = z[base + v];
                      if (base == 0) base = v;
                    }
                    name = null;
                  }
                }
                push(dec.id.name, {tag: dec.init.arguments[0].value, son: [], v: mv});
              }
                break;
              case "_mz": {
                if (dec.init.arguments[3].elements.length > 0) {
                  throw Error("Noticable generics content: " + dec.init.arguments[3].toString());
                }
                let mv = {};
                let name = null, base = 0;
                for (let x of dec.init.arguments[2].elements) {
                  let v = x.value;
                  if (!v && typeof v != "number") {
                    if (x.type == "UnaryExpression" && x.operator == "-") v = -x.argument.value;
                    else throw Error("Unknown type of object in _mz attrs array: " + x.type);
                  }
                  if (name === null) {
                    name = v;
                  } else {
                    if (base + v < 0) mv[name] = null; else {
                      mv[name] = z[zMulName][base + v];
                      if (base == 0) base = v;
                    }
                    name = null;
                  }
                }
                push(dec.id.name, {tag: dec.init.arguments[1].value, son: [], v: mv});
              }
                break;
              case "_gd"://template use/is
              {
                let is = namePool[dec.init.arguments[1].name].content;
                let data = null, obj = null;
                ei++;
                for (let e of core[ei].consequent.body) {
                  if (e.type == "VariableDeclaration") {
                    for (let f of e.declarations) {
                      if (f.init.type == "LogicalExpression" && f.init.left.type == "CallExpression") {
                        if (f.init.left.callee.name == "_1") data = z[f.init.left.arguments[0].value];
                        else if (f.init.left.callee.name == "_1z") data = z[zMulName][f.init.left.arguments[1].value];
                        if (data.startsWith('{{({') && data.endsWith('})}}')) {
                          // 将在 getZ 的 scope 函数中为普通对象定义的表达式解析恢复为双括号，因为 template标签 中可以直接在{{}} 中放置对象， 无需再使用() 包裹  
                          data = `{{${data.substring(4, data.length - 4)}}}`
                        }
                      }
                    }
                  } else if (e.type == "ExpressionStatement") {
                    let f = e.expression;
                    if (f.type == "AssignmentExpression" && f.operator == "=" && f.left.property && f.left.property.name == "wxXCkey") {
                      obj = f.left.object.name;
                    }
                  }
                }
                namePool[obj].tag = "template";
                Object.assign(namePool[obj].v, {is: is, data: data});
              }
                break;
              default: {
                let funName = dec.init.callee.name;
                if (funName.startsWith("gz$gwx")) {
                  zMulName = funName.slice(6);
                } else throw Error("Unknown init callee " + funName);
              }
            }
          } else if (dec.init.type == "FunctionExpression") {
            push(dec.id.name, {tag: "gen", func: dec.init});
          } else if (dec.init.type == "MemberExpression") {
            if (dec.init.object.type == "MemberExpression" && dec.init.object.object.name == "e_" && dec.init.object.property.type == "MemberExpression" && dec.init.object.property.object.name == "x") {
              if (dec.init.property.name == "j") {//include
                //do nothing
              } else if (dec.init.property.name == "i") {//import
                //do nothing
              } else throw Error("Unknown member expression declaration.");
            } else throw Error("Unknown member expression declaration.");
          } else throw Error("Unknown declaration init type " + dec.init.type);
        }
        break;
      case "IfStatement":
        if (e.test.callee.name.startsWith("_o")) { 
          function parse_OFun(e) {
            if (e.test.callee.name == "_o") return z[e.test.arguments[0].value];
            else if (e.test.callee.name == "_oz") return z[zMulName][e.test.arguments[1].value];
            else throw Error("Unknown if statement test callee name:" + e.test.callee.name);
          }

          let vname = e.consequent.body[0].expression.left.object.name;
          let nif = {tag: "block", v: {"wx:if": parse_OFun(e)}, son: []};
          anaRecursion(e.consequent.body, {[vname]: nif});
          pushSon(vname, nif);
          if (e.alternate) {
            while (e.alternate && e.alternate.type == "IfStatement") {
              e = e.alternate;
              //@ts-ignore
              nif = {tag: "block", v: {"wx:elif": parse_OFun(e)}, son: []};
              anaRecursion(e.consequent.body, {[vname]: nif});
              pushSon(vname, nif);
            }
            if (e.alternate && e.alternate.type == "BlockStatement") {
              e = e.alternate;
              //@ts-ignore
              nif = {tag: "block", v: {"wx:else": null}, son: []};
              anaRecursion(e.body, {[vname]: nif});
              pushSon(vname, nif);
            }
          }
        } else {
          throw Error("Unknown if statement.");
        }
        break;
      default:
        throw Error("Unknown type " + e.type);
    }
  }
}

function wxmlify(str: string | String, isText?: boolean) {
  if (typeof str == "undefined" || str === null) return "Empty";//throw Error("Empty str in "+(isText?"text":"prop"));
  if (isText) return str;//may have some bugs in some specific case(undocumented by tx)
  else return str.replace(/"/g, '\\"');
}

function elemToString(elem: Record<any, any>, dep: any) {
  const longerList = [];//put tag name which can't be <x /> style.
  const indent = ' '.repeat(4);

  function isTextTag(elem: Record<any, any>) {
    return elem.tag == "__textNode__" && elem.textNode;
  }

  function elemRecursion(elem: Record<any, any>, dep: any) {
    return elemToString(elem, dep);
  }

  function trimMerge(rets: any) {
    let needTrimLeft = false, ans = "";
    for (let ret of rets) {
      if (ret.textNode == 1) {
        if (!needTrimLeft) {
          needTrimLeft = true;
          ans = ans.trimEnd();
        }
      } else if (needTrimLeft) {
        needTrimLeft = false;
        ret = ret.trimStart();
      }
      ans += ret;
    }
    return ans;
  }

  if (isTextTag(elem)) {
    //In comment, you can use typify text node, which beautify its code, but may destroy ui.
    //So, we use a "hack" way to solve this problem by letting typify program stop when face textNode\
    const StringC = String;
    String()
    let str = new StringC(wxmlify(elem.content, true));
    str['textNode'] = 1;
    return wxmlify(str, true);//indent.repeat(dep)+wxmlify(elem.content.trim(),true)+"\n";
  }
  if (elem.tag == "block") {
    if (elem.son.length == 1 && !isTextTag(elem.son[0])) {
      let ok = true, s = elem.son[0];
      for (let x in elem.v) if (x in s.v) {
        ok = false;
        break;
      }
      if (ok && !(("wx:for" in s.v || "wx:if" in s.v) && ("wx:if" in elem.v || "wx:else" in elem.v || "wx:elif" in elem.v))) {//if for and if in one tag, the default result is an if in for. And we should block if nested in elif/else been combined.
        Object.assign(s.v, elem.v);
        return elemRecursion(s, dep);
      }
    } else if (Object.keys(elem.v).length == 0) {
      let ret = [];
      for (let s of elem.son) ret.push(elemRecursion(s, dep));
      return trimMerge(ret);
    }
  }
  let ret = indent.repeat(dep) + "<" + elem.tag;
  for (let attr in elem.v) {
    if (attr.toString().trim().startsWith("wx:") && typeof elem.v[attr] == "string") {
      if (elem.v[attr].startsWith("{{({") && elem.v[attr].endsWith("})}}")) {
        const data = elem.v[attr].slice(4, elem.v[attr].length - 4)
        if (!data.includes(",") && data.split(":").length == 2) {
          // example {{uuid:uuid}}
          elem.v[attr] = `{{${data}}}`;
        }
      }
    }
    ret += " " + attr + (elem.v[attr] !== null ? "=\"" + wxmlify(elem.v[attr]) + "\"" : "");
  }
  if (elem.son.length == 0) {
    if (longerList.includes(elem.tag)) return ret + " />\n";
    else return ret + "></" + elem.tag + ">\n";
  }
  ret += ">\n";
  let rets = [ret];
  for (let s of elem.son) rets.push(elemRecursion(s, dep + 1));
  rets.push(indent.repeat(dep) + "</" + elem.tag + ">\n");
  return trimMerge(rets);
}

function genReferenceTemplate(z: Record<any, any>, defineRef: Record<string, string>) {
  const state = []
  const result = [];
  for (let v in defineRef) {
    // template 引用定义
    state[0] = v;
    let oriCode = defineRef[v].toString();
    let rName = oriCode.slice(oriCode.lastIndexOf("return") + 6).replace(/[;}]/g, "").trim();
    let tryPtr = oriCode.indexOf("\ntry{");
    let zPtr = oriCode.indexOf("var z=gz$gwx");
    let code = oriCode.slice(tryPtr + 5, oriCode.lastIndexOf("\n}catch(")).trim();
    if (zPtr != -1 && tryPtr > zPtr) {
      let attach = oriCode.slice(zPtr);
      attach = attach.slice(0, attach.indexOf("()")) + "()\n";
      code = attach + code;
    }
    let r = {tag: "template", v: {name: v}, son: []};
    analyze(esprima.parseScript(code).body, z, {[rName]: r}, {[rName]: r});
    result.push(elemToString(r, 0));
  }
  return result.join("");
}

function getDecompiledWxml(code: string, z: Record<any, any>, xPool: string[]) {
  let rName = code.slice(code.lastIndexOf("return") + 6).replace(/[;}]/g, "").trim();
  code = code.slice(code.indexOf("\n"), code.lastIndexOf("return")).trim();
  let r = {son: []};
  const namePool = {[rName]: r}
  const fakePool = {[rName]: r}
  analyze(esprima.parseScript(code).body, z, namePool, xPool, fakePool);
  let ans = [];
  for (let elem of r.son) ans.push(elemToString(elem, 0));
  return ans.join("")
}

export function tryDecompileWxml(f_func_code: string, z: Record<string, any[]>, define: any, xPool: string[]): string {
  try {
    return getDecompiledWxml(f_func_code, z, xPool) + genReferenceTemplate(z, define)
  } catch (e) {
    console.error('[tryDecompileWxml]', e.message)
    return ''
  }
}

