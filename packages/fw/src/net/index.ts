export interface HttpRequest {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: unknown;
    timeoutMs?: number;
}

export interface HttpResponse {
    status: number;
    headers?: Record<string, string>;
    body?: unknown;
}

export interface HttpClient {
    request(req: HttpRequest): Promise<HttpResponse>;
}
