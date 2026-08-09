(function(){
'use strict';

const CLOUD_NAME='kxkboqu2';
const UPLOAD_PRESET='omni_catalog_upload';
const UPLOAD_URL=`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
const MAX_DIMENSION=1600;
const MAX_FILE_SIZE=25*1024*1024;

function loadImage(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file);
    const img=new Image();
    img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Unsupported image format'));};
    img.src=url;
  });
}

async function prepareImage(file){
  if(!file||!String(file.type||'').startsWith('image/'))throw new Error('Please select an image');
  if(file.size>MAX_FILE_SIZE)throw new Error('Image must be smaller than 25 MB');
  if(/image\/(?:gif|heic|heif)/i.test(file.type))return{body:file,name:file.name||'image'};
  try{
    const img=await loadImage(file);
    const scale=Math.min(1,MAX_DIMENSION/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height));
    const width=Math.max(1,Math.round((img.naturalWidth||img.width)*scale));
    const height=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    canvas.getContext('2d').drawImage(img,0,0,width,height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.86));
    if(!blob)return{body:file,name:file.name||'image'};
    const stem=String(file.name||'image').replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9._-]+/g,'_').slice(0,80)||'image';
    return{body:blob,name:stem+'.webp'};
  }catch(e){
    return{body:file,name:file.name||'image'};
  }
}

function deliveryUrl(url){
  const value=String(url||'');
  if(!value.includes('/image/upload/')||value.includes('/image/upload/f_auto,'))return value;
  return value.replace('/image/upload/','/image/upload/f_auto,q_auto,c_limit,w_1600,h_1600/');
}

async function uploadImage(file){
  const prepared=await prepareImage(file);
  const form=new FormData();
  form.append('file',prepared.body,prepared.name);
  form.append('upload_preset',UPLOAD_PRESET);
  const response=await fetch(UPLOAD_URL,{method:'POST',body:form});
  let data={};try{data=await response.json();}catch(e){}
  if(!response.ok||!data.secure_url)throw new Error(data&&data.error&&data.error.message||'Cloudinary upload failed');
  return deliveryUrl(data.secure_url);
}

window.CloudinaryAssets=Object.freeze({cloudName:CLOUD_NAME,uploadPreset:UPLOAD_PRESET,uploadImage,deliveryUrl});
})();
