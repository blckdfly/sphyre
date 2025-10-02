# QR Code Format for Sphyre Interfaces

This document explains the URL format convention for QR codes used in the Sphyre application to differentiate between credential offers and presentation requests.

## URL Format Convention

The Sphyre application can recognize the type of QR code based on the URL format, even before fetching the payload. This allows for faster processing and better user experience.

### Credential Offers

For credential offers, use one of the following URL formats:

1. **Path-based format**:
   - `/offer/...`
   - `/credential/...`
   
   Example:
   ```
   https://example.com/offer/123456
   https://example.com/credential/abc123
   ```

2. **Query parameter format**:
   - `?type=offer`
   - `?type=credential_offer`
   
   Example:
   ```
   https://example.com/api/credentials?type=offer&id=123456
   https://example.com/api/credentials?type=credential_offer&id=abc123
   ```

### Presentation Requests

For presentation requests, use one of the following URL formats:

1. **Path-based format**:
   - `/request/...`
   - `/presentation/...`
   
   Example:
   ```
   https://example.com/request/123456
   https://example.com/presentation/abc123
   ```

2. **Query parameter format**:
   - `?type=request`
   - `?type=presentation_request`
   
   Example:
   ```
   https://example.com/api/credentials?type=request&id=123456
   https://example.com/api/credentials?type=presentation_request&id=abc123
   ```

## Payload Format

The URL should point to a JSON endpoint that returns a payload with the following structure:

### Credential Offer Payload

```json
{
  "type": "credential_offer",
  "issuer": "Example Issuer",
  "credentialType": "Example Credential",
  "attributes": [
    {
      "name": "attribute1",
      "value": "value1"
    },
    {
      "name": "attribute2",
      "value": "value2"
    }
  ]
}
```

### Presentation Request Payload

```json
{
  "type": "presentation_request",
  "verifier": "Example Verifier",
  "requestedCredentials": [
    "credential1",
    "credential2"
  ]
}
```

## Fallback Mechanism

If the application cannot fetch the payload from the URL but can determine the type from the URL format, it will create a basic payload with just the type field and proceed accordingly.

## Testing

You can test QR codes using the testing mode in the QR scanner. Simply enter a URL that follows the format convention described above and click "Process QR URL".