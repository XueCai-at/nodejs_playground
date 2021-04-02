import ffi from "ffi-napi";

var libm = ffi.Library("libm", {
  ceil: ["double", ["double"]],
});
console.log(libm.ceil(3.14)); // 4

// You can also access just functions in the current process by passing a null
var current = ffi.Library(null, {
  atoi: ["int", ["string"]],
});
console.log(current.atoi("1234")); // 1234
