# Self-hosted zkLogin prover

Replaces Enoki's proving service. Runs the Mysten Groth16 prover locally so we
pay no per-seat fee — only our own compute.

## Run

```bash
./download-zkey.sh          # one-time, ~588 MB (git-LFS) (same zkey for testnet + mainnet)
docker compose up -d        # starts prover (internal) + prover-fe (:5001)
curl -s localhost:5001/ping # front-end liveness (if supported by the image)
```

Then set on the control-plane:

```
ZKLOGIN_PROVER_URL=http://localhost:5001/v1
```

(In a shared compose network, use `http://zklogin-prover-fe:8080/v1`.)

## Notes

- Images are `linux/amd64` only. On Apple Silicon they run under emulation
  (the compose file pins `platform: linux/amd64`).
- A proof is generated once per login, not per transaction, so one instance
  scales to many users.
- The prover does **not** verify the Google JWT signature — the control-plane
  does that (`GoogleJwtService`) before proxying to `/v1/auth/zklogin/prove`.
