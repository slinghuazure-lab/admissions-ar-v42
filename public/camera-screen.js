// Fullscreen includes the video, 3D canvas, and controls together.
// Mobile browsers may require a page gesture; camera permission is not one.
export function enableCameraFullscreen(){
  const root=document.documentElement;
  const button=document.querySelector('#fullscreen-toggle'),note=document.querySelector('#screen-note');
  if(navigator.standalone||window.matchMedia?.('(display-mode: standalone)').matches){button.hidden=true;return ()=>{};}
  let pending=false,entered=false;
  const active=()=>!!(document.fullscreenElement||document.webkitFullscreenElement);
  const show=message=>{note.textContent=message;note.hidden=false;};
  const update=()=>{button.textContent=active()?'離開全螢幕':'全螢幕';button.setAttribute('aria-pressed',String(active()));if(active())note.hidden=true;};
  const request=async(explicit=false)=>{
    if(pending||active())return;
    const method=root.requestFullscreen||root.webkitRequestFullscreen;
    if(!method||document.fullscreenEnabled===false){
      if(explicit)show('此瀏覽器無法隱藏工具列。iPhone 可用 Safari「分享 → 加入主畫面」，再從主畫面開啟；App 內請先選擇以 Safari／Chrome 開啟。');
      return;
    }
    pending=true;
    try{await method.call(root,{navigationUI:'hide'});entered=true;update();}catch{if(explicit)show('瀏覽器未允許全螢幕。請以 Safari／Chrome 開啟；iPhone 可將此頁加入主畫面後開啟。');}finally{pending=false;}
  };
  button.onclick=async()=>{
    if(active()){
      try{await (document.exitFullscreen||document.webkitExitFullscreen).call(document);}catch{}
    }else await request(true);
    update();
  };
  document.addEventListener('fullscreenchange',update);document.addEventListener('webkitfullscreenchange',update);update();
  // Best effort on entry; unsupported/denied fullscreen never blocks the camera.
  request();
  document.addEventListener('pointerup',event=>{
    if(event.target.closest?.('button,a,input,dialog'))return;
    if(!entered&&!document.querySelector('#camera-ui')?.hidden)request();
  },{passive:true});
  return request;
}
