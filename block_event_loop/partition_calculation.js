// NOT partitioned
export function syncAvg(n) {
    let sum = 0;
    for (let i = 0; i <= n; i++) {
        sum += i;
    }
    let avg = sum / n;
    console.log('sync avg: ' + avg);
    return avg;
}

// partitioned
// TODO(xue): need to convert callback to promise
export function asyncAvg(n, avgCB) {
    // Save ongoing sum in JS closure.
    var sum = 0;
    function help(i, cb) {
      sum += i;
      if (i == n) {
        cb(sum);
        return;
      }
  
      // "Asynchronous recursion".
      // Schedule next operation asynchronously.
      setImmediate(help.bind(null, i+1, cb));
    }
  
    // Start the helper, with CB to call avgCB.
    help(1, function(sum){
        var avg = sum/n;
        avgCB(avg);
    });
}
  
//   asyncAvg(n, function(avg){
//     console.log('avg of 1-n: ' + avg);
//   });