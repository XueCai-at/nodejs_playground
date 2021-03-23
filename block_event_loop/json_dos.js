var obj = { a: 1 };
var niter = 20;

var before, str, pos, res, took;

for (var i = 0; i < niter; i++) {
  obj = { obj1: obj, obj2: obj }; // Doubles in size each iter
}

before = process.hrtime();
str = JSON.stringify(obj);
took = process.hrtime(before);
console.log(`JSON.stringify took ${took} seconds`);

console.log(`string size: ${str.length / 1024 / 1024}MB`)

before = process.hrtime();
pos = str.indexOf('nomatch');
took = process.hrtime(before);
console.log(`Pure indexof took ${took} seconds`);

before = process.hrtime();
res = JSON.parse(str);
took = process.hrtime(before);
console.log(`JSON.parse took ${took} seconds`);