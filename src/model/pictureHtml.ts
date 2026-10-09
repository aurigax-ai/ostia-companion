import { colors } from '../theme';
import { utf8Bytes } from './files';

const VIEWPORT = '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=8">';
const STYLE = `<style>html,body{margin:0;background:${colors.bgSunken};}img{display:block;max-width:100%;height:auto;margin:0 auto;}</style>`;

const DRAW = `
  function report(e){window.ReactNativeWebView.postMessage(JSON.stringify({height:document.documentElement.scrollHeight,error:e||null}))}
  var img=document.getElementById('picture');
  var source=decodeURIComponent(escape(atob(img.getAttribute('data-source'))));
  mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'dark',htmlLabels:false,flowchart:{htmlLabels:false}});
  mermaid.render('diagram', source).then(function(out){
    img.onload=function(){report()};
    img.onerror=function(){report('The diagram could not be drawn')};
    img.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(out.svg)));
  }).catch(function(err){report(String(err&&err.message||err))});`;

function base64(text: string): string {
  return btoa(utf8Bytes(text));
}

function page(scripts: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'${scripts}">${VIEWPORT}${STYLE}</head><body>${body}</body></html>`;
}

function script(code: string): string {
  return `<script src="data:text/javascript;charset=utf-8;base64,${base64(code)}"></script>`;
}

export function svgPage(svg: string): string {
  return page('', `<img alt="" src="data:image/svg+xml;base64,${base64(svg)}">`);
}

export function mermaidRuntime(mermaid: string): string {
  return script(mermaid) + script(DRAW);
}

export function mermaidPage(source: string, runtime: string): string {
  return page('; script-src data:', `<img id="picture" alt="" data-source="${base64(source)}">${runtime}`);
}
