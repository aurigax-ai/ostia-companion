import { colors } from '../theme';
import { utf8Bytes } from './files';

const VIEWPORT = '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=8">';
const STYLE = `<style>html,body{margin:0;background:${colors.bgSunken};}img{display:block;max-width:100%;height:auto;margin:0 auto;}</style>`;
const REPORT = "window.ReactNativeWebView.postMessage(JSON.stringify({height:document.documentElement.scrollHeight,error:e||null}))";

function page(policy: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'${policy}">${VIEWPORT}${STYLE}</head><body>${body}</body></html>`;
}

function inScript(code: string): string {
  return code.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
}

export function svgPage(svg: string): string {
  return page('', `<img alt="" src="data:image/svg+xml;base64,${btoa(utf8Bytes(svg))}">`);
}

export function mermaidPage(source: string, mermaid: string): string {
  const draw = `
    function report(e){${REPORT}}
    mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'dark',htmlLabels:false,flowchart:{htmlLabels:false}});
    mermaid.render('diagram', ${JSON.stringify(source).replace(/</g, '\\u003c')}).then(function(out){
      var img=document.getElementById('picture');
      img.onload=function(){report()};
      img.onerror=function(){report('The diagram could not be drawn')};
      img.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(out.svg)));
    }).catch(function(err){report(String(err&&err.message||err))});`;
  return page("; script-src 'unsafe-inline'", `<img id="picture" alt=""><script>${inScript(mermaid)}</script><script>${inScript(draw)}</script>`);
}
