use axum::{
    body::Body,
    http::{HeaderValue, Request, StatusCode},
    middleware::Next,
    response::Response,
};

pub async fn cors_handler(request: Request<Body>, next: Next) -> Response {
    if request.method() == axum::http::Method::OPTIONS {
        return Response::builder()
            .status(StatusCode::NO_CONTENT)
            .header("Access-Control-Allow-Origin", "*")
            .header(
                "Access-Control-Allow-Methods",
                "GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD",
            )
            .header(
                "Access-Control-Allow-Headers",
                "Content-Type, Authorization, X-User-DID, Accept",
            )
            .header("Access-Control-Max-Age", "86400")
            .body(Body::empty())
            .unwrap_or_else(|_| Response::new(Body::empty()));
    }

    let mut response = next.run(request).await;

    response
        .headers_mut()
        .insert("Access-Control-Allow-Origin", HeaderValue::from_static("*"));
    response.headers_mut().insert(
        "Access-Control-Allow-Methods",
        HeaderValue::from_static("GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD"),
    );
    response.headers_mut().insert(
        "Access-Control-Allow-Headers",
        HeaderValue::from_static("Content-Type, Authorization, X-User-DID, Accept"),
    );

    response
}
