// Rename the existing mascot only; keep names of future replacement models.
export function modelLabel(name){
  return typeof name==='string'?name.replace(/^(小菁鷹運動版|小菁運動版)(?=$|\s*[·・])/,'北商小菁鷹數媒版'):name;
}
export function catalogLabels(data){
  return {...data,models:data.models?.map(model=>({...model,...('name' in model?{name:modelLabel(model.name)}:{}),...('label' in model?{label:modelLabel(model.label)}:{})}))};
}
