#!/bin/sh
set -e

# Shared CA paths inside the certs volume.
CA_CERT="${CA_CERT:-/certs/lndo.site.pem}"
CA_KEY="${CA_KEY:-/certs/lndo.site.key}"

# 1. Ensure the CA exists (idempotent). Subject CN parity: WPVIP Local CA.
if [ ! -f "$CA_KEY" ]; then
  openssl genrsa -out "$CA_KEY" 2048
fi
if [ ! -f "$CA_CERT" ]; then
  openssl req -x509 -new -nodes -key "$CA_KEY" -sha256 -days 8675 \
    -out "$CA_CERT" \
    -subj "/C=US/ST=California/L=San Francisco/O=Automattic/OU=WPVIP/CN=WPVIP Local CA"
fi

# 2. Per-env leaf cert + Traefik file-provider config (only when requested).
#    CERT_BASENAME names the cert files; CERT_SANS is a space-separated host list;
#    CERT_CN is the cert subject CN (defaults to CERT_BASENAME).
if [ -n "$CERT_BASENAME" ] && [ -n "$CERT_SANS" ]; then
  CRT="/certs/${CERT_BASENAME}.crt"
  KEY="/certs/${CERT_BASENAME}.key"
  CSR="/certs/${CERT_BASENAME}.csr"
  EXT="/certs/${CERT_BASENAME}.ext"
  CN="${CERT_CN:-$CERT_BASENAME}"

  {
    printf '%s\n' "authorityKeyIdentifier=keyid,issuer"
    printf '%s\n' "basicConstraints=CA:FALSE"
    printf '%s\n' "keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment"
    printf '%s\n' "extendedKeyUsage = serverAuth"
    printf '%s\n' "subjectAltName = @alt_names"
    printf '%s\n' "[alt_names]"
  } > "$EXT"
  set -f
  i=1
  for san in $CERT_SANS; do
    printf 'DNS.%s = %s\n' "$i" "$san" >> "$EXT"
    i=$((i + 1))
  done
  set +f

  openssl genrsa -out "$KEY" 2048
  openssl req -new -key "$KEY" -out "$CSR" \
    -subj "/C=US/ST=California/L=San Francisco/O=Automattic/OU=WPVIP/CN=${CN}"
  openssl x509 -req -in "$CSR" -CA "$CA_CERT" -CAkey "$CA_KEY" \
    -CAcreateserial -out "$CRT" -days 825 -sha256 -extfile "$EXT"
  rm -f "$CSR" "$EXT"

  mkdir -p /proxy_config
  cat > "/proxy_config/${CERT_BASENAME}.yaml" <<EOF
tls:
  certificates:
    - certFile: ${CRT}
      keyFile: ${KEY}
EOF
fi
