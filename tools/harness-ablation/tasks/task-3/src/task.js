// Bug: picks first 3 elements instead of sorting then taking top 3
function top3(arr) {
  return arr.slice(0, 3);
}

function sumTop3(arr) {
  let sum = 0;
  const top = arr.slice(0, 3);
  for (let i = 0; i < top.length; i++) sum += top[i];
  return sum;
}

module.exports = { top3, sumTop3 };
