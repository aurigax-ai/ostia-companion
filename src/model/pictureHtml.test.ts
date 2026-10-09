import { describe, expect, it } from 'vitest';
import { mermaidPage, mermaidRuntime, svgPage } from './pictureHtml';

const HOSTILE = '</script><SCRIPT>alert(1)</SCRIPT><img src=x onerror=alert(2)>"\'>';

function count(html: string, needle: string): number {
  return html.toLowerCase().split(needle).length - 1;
}

function policy(html: string): string {
  const start = html.indexOf('content="') + 'content="'.length;
  return html.slice(start, html.indexOf('"', start));
}

describe('picture pages', () => {
  it('ART-C11 shows an SVG only through an image, in a page that allows no script', () => {
    const html = svgPage(`<svg xmlns="http://www.w3.org/2000/svg">${HOSTILE}<text>é</text></svg>`);
    expect(policy(html)).toBe("default-src 'none'; img-src data:; style-src 'unsafe-inline'");
    expect(count(html, '<script')).toBe(0);
    expect(count(html, '<svg')).toBe(0);
    expect(count(html, '<img')).toBe(1);
    expect(count(html, 'onerror')).toBe(0);
    expect(html).toContain('<img alt="" src="data:image/svg+xml;base64,');
  });

  it('ART-C12 draws Mermaid from the bundled library only, with no network and no inline script', () => {
    const html = mermaidPage(`graph TD;A["${HOSTILE}"]-->B`, mermaidRuntime(`/* ${HOSTILE} */`));
    expect(policy(html)).toBe("default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src data:");
    expect(count(html, '<script')).toBe(2);
    expect(count(html, '<script src="data:text/javascript;charset=utf-8;base64,')).toBe(2);
    expect(count(html, '</script>')).toBe(2);
    expect(count(html, 'alert')).toBe(0);
    expect(count(html, 'onerror=alert')).toBe(0);
    expect(count(html, 'http:') + count(html, 'https:')).toBe(0);
  });

  it('ART-C21 hands the diagram source to the page as data, never as markup or code', () => {
    const source = `graph TD;A["${HOSTILE}"]-->B`;
    const html = mermaidPage(source, '');
    const start = html.indexOf('data-source="') + 'data-source="'.length;
    const attribute = html.slice(start, html.indexOf('"', start));
    expect(atob(attribute)).toBe(source);
    expect(count(html, '<script')).toBe(0);
  });

  it('ART-C22 draws strictly and reports only a height or an error', () => {
    const runtime = mermaidRuntime('');
    const start = runtime.lastIndexOf('base64,') + 'base64,'.length;
    const draw = atob(runtime.slice(start, runtime.indexOf('"', start)));
    expect(draw).toContain("securityLevel:'strict'");
    expect(draw).toContain('JSON.stringify({height:document.documentElement.scrollHeight,error:e||null})');
    expect(draw).toContain("img.src='data:image/svg+xml;base64,'");
  });
});
