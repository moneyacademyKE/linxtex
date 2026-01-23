export type Middleware = (
    request: Request,
    env: any,
    ctx: ExecutionContext,
    next: () => Promise<Response>
) => Promise<Response>;

export function composeMiddleware(middlewares: Middleware[]) {
    return (request: Request, env: any, ctx: ExecutionContext): Promise<Response> => {
        let index = -1;

        function dispatch(i: number): Promise<Response> {
            if (i <= index) return Promise.reject(new Error('next() called multiple times'));
            index = i;
            const fn = middlewares[i];
            if (!fn) return Promise.resolve(new Response('Not Found', { status: 404 }));
            try {
                return Promise.resolve(fn(request, env, ctx, () => dispatch(i + 1)));
            } catch (err) {
                return Promise.reject(err);
            }
        }

        return dispatch(0);
    };
}

// Example middleware: Logger
export const logMiddleware: Middleware = async (request, env, ctx, next) => {
    const start = Date.now();
    const response = await next();
    const duration = Date.now() - start;
    console.log(`${request.method} ${request.url} - ${response.status} (${duration}ms)`);
    return response;
};

// Example middleware: Error Handler
export const errorMiddleware: Middleware = async (request, env, ctx, next) => {
    try {
        return await next();
    } catch (err: any) {
        console.error('Unhandled error:', err);
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
