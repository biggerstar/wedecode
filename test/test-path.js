const globPathList = [
  // macGlob
  '/Users/*/Library/Containers/*/Data/wx95b6ffff5caf289e/.wxapplet/packages/*',
  // winGlob
  'C:\\Users\\*\\Documents\\WeChat Files\\wx95b6ffff5caf289e\\Applet\\*',
  // linuxGlob
  '/home/*/.config/wx95b6ffff5caf289e/WeChat/Applet/*'
]
function isWxAppid(str) {
  const reg = /^wx[0-9a-f]{15,18}$/i
  str = str.trim()
  return str.length === 18 && reg.test(str)
}

function getPathSplitList(_path) {
  let delimiter = '\\'
  let partList
  partList = _path.split('\\') // win 
  if (partList.length <= 1) {
    delimiter = '/'
    partList = _path.split('/') // win 第二种路径或者 unix 路径
  }
  return {
    partList,
    delimiter
  }
}

function findWxAppIdPath(_path) {
  const {partList, delimiter} = getPathSplitList(_path)
  let newPathList = [...partList]
  for (const index in partList.reverse()) {
    const dirName = partList[index]
    if (isWxAppid(dirName)) {
      break
    }
    newPathList.pop()
  }
  return newPathList.join(delimiter)
}

console.log(findWxAppIdPath(globPathList[0]))
console.log(findWxAppIdPath(globPathList[1]))
console.log(findWxAppIdPath(globPathList[2]))
