# For client

```json
{
  "X-TransactionHash": "[]",
  "X-Sequence": "[integer number]",
  "X-Signatures": "[]",
}
```

## TransactionHash

Transaction hash is of transaction which you sent tokens to at least one of specified addresses.
Transaction hash is interpreted as txhash for short.

## Sequence

Sequence is integer and it must be incremented after every requests.

## Signatures

Signatures is a string of comma separeted signatures.

Each signatures must be encoded with base64 string (These are not hex string).

The message for creating signature is `${txhash}${sequence}` which is encoded with utf-8.

## API

### `/node-toller`

You can check information for using api which is protected from use

###