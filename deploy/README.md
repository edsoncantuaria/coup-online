# Produção do Intriga

| Endereço | O que é | Porta na VM |
|---|---|---|
| https://intriga.cloudive.com.br | Flutter web (nginx) | `127.0.0.1:9102` |
| https://api-intriga.cloudive.com.br | Servidor (Socket.io + API de contas) | `127.0.0.1:9101` |

- **VM:** `edson@184.107.160.10`, código em `~/coup/coup-online`.
- **Acesso público:** pelo Cloudflare Tunnel `aestheticflow`, o mesmo do outro
  sistema da VM. As duas rotas do Intriga ficam antes da regra final de 404.
  Os DNS são CNAMEs com proxy para `<tunnel-id>.cfargotunnel.com`. Ao mexer no
  túnel, preserve as rotas do agendamento.
- **Dados:** banco SQLite no volume Docker `intriga_intriga-data` (`/data/intriga.db`
  no container).
- **Segredos:** opcionais, em `deploy/.env` (fora do git): `SMTP_HOST`,
  `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`. Sem SMTP, os emails de
  confirmação vão só para o log do container.

## Atualizar

Na sua máquina:

```bash
git push origin master
cd flutter_app && flutter build web --release --dart-define=COUP_SERVER_URL=https://api-intriga.cloudive.com.br
rsync -az --delete build/web/ edson@184.107.160.10:coup/coup-online/deploy/web/
```

Na VM:

```bash
cd ~/coup/coup-online && git pull --ff-only origin master
cd deploy && docker compose up -d --build
curl -s -o /dev/null -w "%{http_code}\n" localhost:9101/api/rooms   # 200
```

## APK

```bash
cd flutter_app && flutter build apk --release --dart-define=COUP_SERVER_URL=https://api-intriga.cloudive.com.br
```

Sai em `flutter_app/build/app/outputs/flutter-apk/app-release.apk`. Ainda é
assinado com a chave de debug: serve para instalar direto no celular, mas a
Play Store exige uma chave própria.

## Backup

```bash
docker compose exec api node -e "require('node:sqlite'); new (require('node:sqlite').DatabaseSync)('/data/intriga.db').exec(\"VACUUM INTO '/data/backup.db'\")"
docker compose cp api:/data/backup.db ./intriga-backup.db
```
