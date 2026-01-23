export async function makeTelegraphPage(title: string, content: any[], token: string) {
    const body = {
        title: title.substring(0, 256),
        author_name: 'LinxtexBot',
        author_url: 'https://t.me/LinxtexBot',
        content,
        return_content: true
    };

    const response = await fetch('https://api.telegra.ph/createPage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, access_token: token })
    });

    const result: any = await response.json();
    if (!result.ok) {
        throw new Error(`Telegra.ph error: ${result.error}`);
    }
    return result.result.url;
}

// Function to convert HTML to Telegra.ph compatible JSON structure
// This is a simplified version of dom.js for workers
export function htmlToTelegraph(html: string) {
    // We'll need a DOM parser here, using linkedom in the worker
    return [{ tag: 'p', children: [html] }]; // Placeholder
}
