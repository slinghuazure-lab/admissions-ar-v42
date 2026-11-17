export function detectDevice(userAgent,platform,touchPoints,quickLook){
  const ios=/iPhone|iPad|iPod/.test(userAgent)||(platform==='MacIntel'&&touchPoints>1);
  const android=/Android/i.test(userAgent);
  const inApp=/Line\/|FBAN|FBAV|Instagram/i.test(userAgent);
  return {platform:ios?'ios':android?'android':'desktop',supported:!inApp&&(android||(ios&&quickLook)),inApp};
}
export function directLink(device,model,venueId,entryUrl){
  const entry=new URL(entryUrl);
  if(device.platform==='ios'){
    const modelUrl=new URL(model.usdz,entry);if(modelUrl.protocol!=='https:'&&modelUrl.hostname!=='localhost'&&modelUrl.hostname!=='127.0.0.1')throw new Error('模型網址須使用 HTTPS');
    return {href:modelUrl.href,rel:'ar'};
  }
  if(device.platform==='android'){
    const modelUrl=new URL(model.glb,entry);if(modelUrl.protocol!=='https:'&&modelUrl.hostname!=='localhost'&&modelUrl.hostname!=='127.0.0.1')throw new Error('模型網址須使用 HTTPS');
    const fallback=new URL('./ar.html',entry);fallback.searchParams.set('venue',venueId);fallback.searchParams.set('fallback','1');
    const params=new URLSearchParams({file:modelUrl.href,mode:'ar_only',title:model.name,resizable:'true'});
    return {href:`intent://arvr.google.com/scene-viewer/1.0?${params}#Intent;scheme=https;package=com.google.android.googlequicksearchbox;action=android.intent.action.VIEW;S.browser_fallback_url=${encodeURIComponent(fallback.href)};end;`,rel:''};
  }
  return null;
}
