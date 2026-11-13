// Sources run unchanged by both public verify() and an independent native oracle.
const setter = `/** @param {{x:number,y:number}} a */
// modifies a.x
// ensures a.x===1
function set(a){a.x=1;return true;}
`;
export const cases = [
  { id: "record-alias", source: `/** @param {{x:number}} a @param {{x:number}} b */
// modifies a.x
// ensures Object.is(result,a===b?1:old(b.x))
function f(a,b){a.x=1;return b.x;}`, inputs: () => { const a={x:-0}; return [[a,a],[{x:NaN},{x:Infinity}]]; }, holds: (r,[a,b],before) => Object.is(r,a===b?1:before[1].x) },
  { id: "array-alias", source: `/** @param {number[]} a @param {number[]} b */
// requires a.length>0
// modifies a
// ensures Object.is(result,a===b?1:old(b[0]))
function f(a,b){a[0]=1;return b[0];}`, inputs: () => { const a=[-0]; return [[a,a],[[NaN],[Infinity]]]; }, holds: (r,[a,b],before) => Object.is(r,a===b?1:before[1][0]) },
  { id: "call-frame", source: setter+`/** @param {{x:number,y:number}} a @param {{x:number,y:number}} b */
// modifies a.x
// ensures a.x===1
// ensures Object.is(result,old(b.y))
function f(a,b){set(a);return b.y;}`, inputs: () => { const a={x:0,y:-0}; return [[a,a],[{x:NaN,y:1},{x:2,y:Infinity}]]; }, holds: (r,[a],before) => a.x===1 && Object.is(r,before[1].y) },
  { id: "join-arms", source: `/** @param {{x:number}} a @param {{x:number}} b @param {boolean} flag */
// modifies a.x,b.x
// ensures result===(flag?1:2)
function f(a,b,flag){return flag?(a.x=1):(b.x=2);}`, inputs: () => [[{x:0},{x:0},true],[{x:0},{x:0},false]], holds: (r,[a,b,flag]) => r===(flag?1:2) && (flag?a.x===1:b.x===2) },
  { id: "short-circuit", source: `/** @param {number[]} a @param {boolean} flag */
// requires a.length>0
// modifies a
// ensures Object.is(result,flag?1:old(a[0]))
function f(a,flag){flag&&(a[0]=1,true);return a[0];}`, inputs: () => [[[-0],true],[[NaN],false]], holds: (r,[_a,flag],before) => Object.is(r,flag?1:before[0][0]) },
  { id: "fresh-snapshot", source: `/** @param {number[]} a */
// requires a.length>0
// modifies a
// ensures Object.is(result,old(a[0]))
function f(a){const b=a.slice();const c={v:b[0]};a[0]=7;b[0]=8;return c.v;}`, inputs: () => [[[-0]],[[NaN]],[[Infinity]]], holds: (r,_a,before) => Object.is(r,before[0][0]) },
  { id: "old-and-presence", source: `/** @param {{x:number,y?:number}} a */
// modifies a.x
// ensures old(a)===a
// ensures Object.is(result,old(a.x))
// ensures Object.is(a.y,old(a.y))
function f(a){const x=a.x;a.x=-0;return x;}`, inputs: () => [[{x:NaN}],[{x:Infinity,y:undefined}],[{x:-0,y:0}]], holds: (r,[a],before) => Object.is(r,before[0].x) && Object.is(a.x,-0) && Object.hasOwn(a,"y")===Object.hasOwn(before[0],"y") && Object.is(a.y,before[0].y) },
  { id: "boolean-presence", source: `/** @param {{items:boolean[],maybe?:boolean}} box */
// requires box.items.length>0
// modifies box.items
// ensures result===false
// ensures Object.is(box.maybe,old(box.maybe))
function f(box){box.items[0]=false;return box.items[0];}`, inputs: () => [[{items:[true]}],[{items:[false],maybe:undefined}],[{items:[true],maybe:true}]], holds: (r,[box],before) => r===false && Object.hasOwn(box,"maybe")===Object.hasOwn(before[0],"maybe") && Object.is(box.maybe,before[0].maybe) },
  { id: "fresh-local", source: `/** @param {boolean} flag */
// ensures result===(flag?3:2)
function f(flag){const a=[0];const b={x:0};const alias=a;b.x=2;alias[0]=flag?3:2;return a[0];}`, inputs: () => [[true],[false]], holds: (r,[flag]) => r===(flag?3:2) },
  ...["a.x=a.x;", "const x=a.x;a.x=1;a.x=x;"].map((body,i) => ({ id: i?"restored-store":"noop-store", source: `/** @param {{x:number}} a */
// ensures true
function f(a){${body}return true;}`, status: "counterexample", reason: "frame-write", inputs: () => [[{x:-0}],[{x:NaN}]], holds: (r,_a,_before,writes) => r===true && writes.length>0 })),
  { id: "local-result", source: `/** @param {number} x */
// ensures Object.is(result,old(x))
function f(x){const result=x;return result;}`, inputs: () => [[-0],[NaN],[Infinity]], holds: (r,_a,before) => Object.is(r,before[0]) },
  { id: "element-marker-field", source: `// ensures result===1
function f(){const a={"@elements":0};a["@elements"]=1;return a["@elements"];}`, inputs: () => [[]], holds: (r) => r===1 },
];

export function nativeRows(c) {
  const f = Function(`${c.source}\nreturn f;`)();
  return c.inputs().map((input) => {
    const args = structuredClone(input), before = structuredClone(args), writes=[];
    if (c.reason === "frame-write") args[0] = new Proxy(args[0], { set(o,k,v) { writes.push(k); return Reflect.set(o,k,v); } });
    const result = f(...args);
    return { before, after: args, result, writes, holds: c.holds(result,args,before,writes) };
  });
}
