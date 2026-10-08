import { describe, expect, it } from 'vitest';
import { mermaidPage, svgPage } from './pictureHtml';

describe('picture pages', () => {
  it('ART-C11 shows an SVG only through an image, with no script allowed', () => {
    const html = svgPage('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><text>é</text></svg>');
    expect(html).toContain('<img alt="" src="data:image/svg+xml;base64,');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<svg');
    expect(html).toContain("default-src 'none'; img-src data:; style-src 'unsafe-inline'\"");
  });

  it('ART-C12 draws Mermaid strictly, to an image, with no network in the policy', () => {
    const html = mermaidPage('graph TD;A["</script><script>alert(1)</script>"]-->B', '/*mermaid*/');
    expect(html).toContain("securityLevel:'strict'");
    expect(html).toContain("default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'\"");
    expect(html).not.toMatch(/https?:|connect-src/);
    expect(html.match(/<script>/g)).toHaveLength(2);
    expect(html.match(/<\/script>/g)).toHaveLength(2);
    expect(html).toContain("img.src='data:image/svg+xml;base64,'");
  });
});
