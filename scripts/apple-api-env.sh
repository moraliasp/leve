#!/usr/bin/env bash
# Limpa e confere o Issuer ID e o Key ID da chave de notarização antes de compilar (#127).
# O notarytool só recusa no fim do build, e uma quebra de linha no fim do segredo
# (`echo … | gh secret set`) já basta para ele dizer que o Issuer não é UUID.
# Lê APPLE_API_ISSUER e APPLE_API_KEY do ambiente e grava os valores limpos em $GITHUB_ENV,
# mascarados no log. Nunca imprime o valor, só o que ele parece ser.
set -euo pipefail

UUID='^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$'
KEY_ID='^[A-Z0-9]{10}$'

# UUID e Key ID não têm espaço nem aspas: tirar de qualquer lugar é o mesmo que tirar das pontas.
limpar() { printf '%s' "$1" | tr -d " \t\r\n\"'"; }

ISSUER=$(limpar "${APPLE_API_ISSUER:-}")
KEY=$(limpar "${APPLE_API_KEY:-}")
ERRO=0

if [[ ! "$ISSUER" =~ $UUID ]]; then
  if [ -z "$ISSUER" ]; then DICA="está vazio"
  elif [[ "$ISSUER" =~ $KEY_ID ]]; then DICA="parece um Key ID (10 caracteres), não o Issuer ID"
  else DICA="tem ${#ISSUER} caracteres, e o Issuer ID é um UUID de 36 (8-4-4-4-12)"; fi
  echo "::error::Segredo APPLE_API_ISSUER do environment release $DICA. O Issuer ID fica acima da lista de chaves em App Store Connect › Users and Access › Integrations."
  ERRO=1
fi
if [[ ! "$KEY" =~ $KEY_ID ]]; then
  if [ -z "$KEY" ]; then DICA="está vazio"
  elif [[ "$KEY" =~ $UUID ]]; then DICA="parece o Issuer ID (UUID), não o Key ID"
  else DICA="tem ${#KEY} caracteres, e o Key ID tem 10 (letras maiúsculas e números)"; fi
  echo "::error::Segredo APPLE_API_KEY do environment release $DICA."
  ERRO=1
fi
[ "$ERRO" = 0 ] || exit 1

echo "::add-mask::$ISSUER"
echo "::add-mask::$KEY"
{
  echo "APPLE_API_ISSUER=$ISSUER"
  echo "APPLE_API_KEY=$KEY"
} >> "$GITHUB_ENV"
