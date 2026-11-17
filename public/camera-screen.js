// Fullscreen includes the video, 3D canvas, and controls together.
// Mobile browsers may require a page gesture; camera permission is not one.
export function enableCameraFullscreen(){
  const root=document.documentElement;
  let pending=false,entered=false;
  const request=async()=>{
    if(pending||entered||document.fullscreenElement||document.webkitFullscreenElement)return;
    const method=root.requestFullscreen||root.webkitRequestFullscreen;
    if(!method||document.fullscreenEnabled===false)return;
    pending=true;
    try{await method.call(root,{navigationUI:'hide'});entered=true;}catch{}finally{pending=false;}
  };
  // Best effort on entry; unsupported/denied fullscreen never blocks the camera.
  request();
  document.addEventListener('pointerup',event=>{
    if(event.target.closest?.('button,a,input,dialog'))return;
    if(!document.querySelector('#camera-ui')?.hidden)request();
  },{passive:true});
  return request;
}
