import { expect, test, describe } from 'vitest';
import { convertToTelegraphNodes } from '../src/domain';

describe('Telegraph Transformation Normalization', () => {
    test('should normalize relative image URLs using baseUrl', () => {
        const html = `
            <div>
                <h1>Test Article</h1>
                <p>Check this image: <img src="/images/corp/logo.png"></p>
                <p>And this video: <video src="assets/promo.mp4"></video></p>
                <p>Read more: <a href="contact-us">here</a></p>
            </div>
        `;
        const baseUrl = 'https://moecapital.com/blog/article-1';
        const { nodes } = convertToTelegraphNodes(html, baseUrl);

        // Find the inner p node within the outer transformed div (which is now a p)
        const outerP = nodes[0];
        const innerP = outerP.children.find((n: any) => n.tag === 'p' && n.children?.some((c: any) => c.tag === 'img'));
        
        const img = innerP.children.find((c: any) => c.tag === 'img');
        expect(img.attrs.src).toBe('https://moecapital.com/images/corp/logo.png');

        // Find the video node
        const videoP = outerP.children.find((n: any) => n.tag === 'p' && n.children?.some((c: any) => c.tag === 'video'));
        const video = videoP.children.find((c: any) => c.tag === 'video');
        expect(video.attrs.src).toBe('https://moecapital.com/blog/assets/promo.mp4');

        // Find the anchor node
        const aP = outerP.children.find((n: any) => n.tag === 'p' && n.children?.some((c: any) => c.tag === 'a'));
        const a = aP.children.find((c: any) => c.tag === 'a');
        expect(a.attrs.href).toBe('https://moecapital.com/blog/contact-us');
    });

    test('should NOT change absolute URLs', () => {
        const html = '<div><img src="https://other.com/photo.jpg"></div>';
        const baseUrl = 'https://example.com';
        const { nodes } = convertToTelegraphNodes(html, baseUrl);
        const img = nodes[0].children[0];
        expect(img.attrs.src).toBe('https://other.com/photo.jpg');
    });

    test('should handle missing baseUrl gracefully', () => {
        const html = '<div><img src="/test.jpg"></div>';
        const { nodes } = convertToTelegraphNodes(html);
        const img = nodes[0].children[0];
        expect(img.attrs.src).toBe('/test.jpg');
    });

    test('detectUrls should find urls in typical event data', () => {
        const { detectUrls } = require('../src/domain');
        const text = 'Success Check: https://www.standardmedia.co.ke/business/article/2001543869/how-smart-homes-are-transforming-urban-living-experience-in-kenya';
        const urls = detectUrls(text);
        expect(urls).toHaveLength(1);
        expect(urls[0]).toBe('https://www.standardmedia.co.ke/business/article/2001543869/how-smart-homes-are-transforming-urban-living-experience-in-kenya');
    });
});
