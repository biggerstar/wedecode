/*
* 为了解决 TypeError: _typeofX is not a function 问题， 使用了注入该段代码， 这样只能解决部分问题
* 但是默认有一劳永逸解决的方法，如果你遇到这该类型报错
* 请按操作执行:  右上角点击“详情”=>“本地设置”=>“将JS编译成ES5”=>取消勾选
* */

function _typeof2(o) {
  return (_typeof2 = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) {
    return typeof o;
  } : function (o) {
    return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;
  })(o);
}

function _typeof(o) {
  return "function" == typeof Symbol && "symbol" === _typeof2(Symbol.iterator) ? module.exports = _typeof = function (o) {
    return _typeof2(o);
  } : module.exports = _typeof = function (o) {
    return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : _typeof2(o);
  }, _typeof(o);
}

module.exports = _typeof;

