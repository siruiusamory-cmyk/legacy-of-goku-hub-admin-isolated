export const starLayouts = {
  1: [[50,50]],
  2: [[38,38],[64,64]],
  3: [[50,30],[35,61],[65,61]],
  4: [[35,35],[65,35],[35,65],[65,65]],
  5: [[50,26],[36,44],[64,44],[36,66],[64,66]],
  6: [[38,32],[62,32],[31,54],[50,48],[69,54],[50,70]],
  7: [[40,31],[60,31],[30,50],[50,50],[70,50],[40,69],[60,69]]
};
export function starPolygon(number) {
  if (!Number.isInteger(number) || number < 1 || number > 7) throw Error('Dragon Ball number must be 1 through 7');
  const radius = number === 1 ? 11 : number <= 4 ? 9.5 : 8.5;
  return Array.from({length:10}, (_,i) => {
    const angle = (-90 + i*36) * Math.PI/180;
    const r = i % 2 ? radius * .42 : radius;
    return `${(Math.cos(angle)*r).toFixed(3)},${(Math.sin(angle)*r).toFixed(3)}`;
  }).join(' ');
}
