# Media backend

S3 for the files, DynamoDB for the index, two Lambdas, no API Gateway.

```
guest's phone ──presigned PUT──▶  S3  ──ObjectCreated──▶  ThumbFunction
      │                            │                          │
      └──POST /upload/init────▶ ApiFunction ◀──index──▶  DynamoDB
                                   │
                          GET /media (presigned GETs)
```

The bytes never pass through Lambda. A 4GB video costs the same in compute
as a selfie, and the file that lands in the bucket is byte-identical to the
one that left the phone — nothing in the path can re-encode it.

## Why these choices

**Presigned URLs, not an upload endpoint.** Lambda has a 6MB request limit
and you pay for every second a byte is in flight. Signing a URL and getting
out of the way removes both problems.

**Multipart over ~8MB.** Parts upload in parallel, a failed part retries on
its own instead of restarting a 3GB file, and the client can resume after a
reload. The API signs a rolling window of ~20 part URLs rather than all
10,000, because signatures expire.

**No secondary index.** The DynamoDB sort key is an inverted timestamp
(`9999999999999 - now`, zero-padded), so a plain forward Query returns
newest-first and pagination is one opaque cursor.

**Thumbnails for images only.** Videos get their poster from the browser
that just picked the file — one seek and a canvas draw. That keeps an
ffmpeg layer out of the stack. If you later want posters for files the
browser cannot decode (HEVC on some browsers), add an ffmpeg layer and
extend `thumb.ts`; the original is never rewritten either way.

**Private bucket.** No public policy, no public ACLs. Everything is read
back through short-lived presigned GETs minted per request.

## Deploy

Needs the AWS CLI configured, the SAM CLI, and Docker running (for the
layer build).

```bash
cd backend
npm install                 # only for typecheck; SAM builds its own copies
sam build --use-container   # the container matters: sharp is native
sam deploy --guided
```

Answer the prompts; when it asks for `SiteOrigin`, give the site's origin
(`https://…`) — it locks down both CORS and the bucket. `*` is fine while
developing, but do not leave it that way.

The deploy prints `ApiUrl`. Put it in the site's `.env.local`:

```
NEXT_PUBLIC_MEDIA_API=https://xxxx.lambda-url.eu-central-1.on.aws
```

## Parameters

| Parameter | Default | Notes |
| --- | --- | --- |
| `SiteOrigin` | `*` | Allowed origin for the API and the bucket CORS |
| `SingleShotLimitMB` | 8 | At or under this, one PUT; above it, multipart |
| `PartSizeMB` | 16 | 16MB × 10,000 parts caps one file at 160GB |

## Routes

| Method | Path | Does |
| --- | --- | --- |
| POST | `/upload/init` | Creates the index row, returns a PUT URL or multipart part URLs |
| POST | `/upload/parts` | Signs more part URLs for a long upload |
| POST | `/upload/complete` | Completes the multipart upload, makes the item visible |
| POST | `/upload/abort` | Aborts the multipart upload, drops the row |
| POST | `/poster` | Signs a PUT for a browser-made video poster |
| GET | `/media?cursor=` | The wall, newest first, 24 at a time |

## Things worth knowing before the wedding

- **The bucket CORS must expose `ETag`.** Multipart completion needs each
  part's ETag, and the browser cannot read the header without it. The
  template already does this; if you hand-edit the bucket, do not drop it.
- **Abandoned multipart uploads cost money.** A lifecycle rule aborts them
  after 7 days.
- **There is no authentication.** Anyone with the API URL can upload. That
  was the deliberate choice for guests scanning a QR code at the table. If
  the link leaks, the cheapest fix is a shared code checked in
  `ApiFunction` before signing anything.
- **No rate limiting.** Add a reserved concurrency and a per-IP check in
  `init` if you are worried about abuse.
- **Deleting the stack keeps the bucket** (CloudFormation will not delete a
  non-empty bucket). Empty it by hand if you really want it gone.
