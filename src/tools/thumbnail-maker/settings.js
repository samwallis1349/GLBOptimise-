export const DEFAULT_SETTINGS={size:1024,mode:'colour',colour:'#111318',lighting:'studio',exposure:1,angle:'three-quarter',shadow:false,shadowStrength:.3};
export function validateSettings(value){
  if(!value||typeof value!=='object')throw new Error('Invalid preset settings.');
  const s={...DEFAULT_SETTINGS,...value};
  if(![512,1024,2048].includes(s.size)||!['colour','transparent'].includes(s.mode)||!/^#[0-9a-f]{6}$/i.test(s.colour)||!['studio','bright','dramatic'].includes(s.lighting)||!['three-quarter','front','side','back'].includes(s.angle)||!Number.isFinite(s.exposure)||s.exposure<.5||s.exposure>2||typeof s.shadow!=='boolean'||!Number.isFinite(s.shadowStrength)||s.shadowStrength<0||s.shadowStrength>1)throw new Error('Unsupported preset values.');
  return Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map(k=>[k,s[k]]));
}
export function readSettings(page){const v=id=>page.querySelector('#tm-'+id);return validateSettings({size:Number(v('size').value),mode:v('background-mode').value,colour:v('background').value,lighting:v('lighting').value,exposure:Number(v('exposure').value),angle:v('angle').value,shadow:v('shadow').checked,shadowStrength:Number(v('shadow-strength').value)});}
export function writeSettings(page,settings){const s=validateSettings(settings),v=id=>page.querySelector('#tm-'+id);v('size').value=s.size;v('background-mode').value=s.mode;v('background').value=s.colour;v('lighting').value=s.lighting;v('exposure').value=s.exposure;v('angle').value=s.angle;v('shadow').checked=s.shadow;v('shadow-strength').value=s.shadowStrength;}
