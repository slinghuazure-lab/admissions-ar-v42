export function coverCrop(sourceWidth,sourceHeight,targetWidth,targetHeight){
  if([sourceWidth,sourceHeight,targetWidth,targetHeight].some(n=>!Number.isFinite(n)||n<=0))throw new Error('影像尺寸尚未就緒');
  const scale=Math.max(targetWidth/sourceWidth,targetHeight/sourceHeight),width=targetWidth/scale,height=targetHeight/scale;
  return {x:(sourceWidth-width)/2,y:(sourceHeight-height)/2,width,height};
}
export function photoSize(width,height,pixelRatio=1){const scale=Math.min(Math.max(pixelRatio,1),2,1920/Math.max(width,height));return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};}
export function cameraError(error){
  if(error?.name==='NotAllowedError'||error?.name==='SecurityError')return '尚未取得相機權限。請在瀏覽器的網站設定允許相機，再重新整理此頁。';
  if(error?.name==='NotFoundError'||error?.name==='DevicesNotFoundError')return '找不到可用的相機。請使用有相機的手機開啟此頁。';
  if(error?.name==='NotReadableError'||error?.name==='TrackStartError')return '相機目前無法使用。請先關閉其他使用相機的程式，再重新整理。';
  if(error?.name==='OverconstrainedError')return '此裝置無法使用要求的相機設定，請改用 Safari 或 Chrome。';
  return error?.message||'暫時無法開啟合照，請確認網路後重新整理。';
}
