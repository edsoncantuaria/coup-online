// Páginas simples que os links dos emails abrem no navegador.

function page(title: string, body: string, script = '') {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Intriga</title>
<style>
body{margin:0;background:#120E0C;color:#EFE6D2;font-family:"Arial Narrow",Arial,sans-serif}
main{max-width:420px;margin:0 auto;padding:48px 16px}
h1{font-family:cursive;color:#D9B25A;font-weight:400;font-size:36px;margin:0 0 16px}
p{font-size:17px;line-height:1.5;color:#C2B6A0}
label{display:block;font-size:13px;letter-spacing:2px;color:#C2B6A0;margin:20px 0 6px}
input{box-sizing:border-box;width:100%;padding:14px;font-size:17px;background:#26201B;color:#EFE6D2;border:0;border-bottom:1px solid #3A322B}
input:focus{outline:none;border-bottom:2px solid #D9B25A}
button{margin-top:24px;width:100%;min-height:56px;background:#6B1622;color:#D9B25A;border:0;font-size:15px;font-weight:700;letter-spacing:2px;cursor:pointer}
button:disabled{background:#26201B;color:#978B78}
.strip{height:8px;background:#5E5852;margin-top:32px}
#msg{min-height:24px}
.err{color:#E8705F}.ok{color:#6FBF8A}
</style></head><body><main>${body}<div class="strip"></div></main>${script}</body></html>`;
}

export function verifyResultPage(ok: boolean) {
  return ok
    ? page('Email confirmado', '<h1>Email confirmado.</h1><p>Pode voltar para o jogo. Sua conta está protegida.</p>')
    : page(
        'Link inválido',
        '<h1>Link vencido.</h1><p>Este link já foi usado ou expirou. No jogo, peça um novo em Conta.</p>',
      );
}

export function resetPasswordPage() {
  return page(
    'Trocar a senha',
    `<h1>Senha nova.</h1>
<form id="f"><label for="p1">SENHA NOVA</label><input id="p1" type="password" minlength="6" maxlength="128" autocomplete="new-password" required>
<label for="p2">REPITA A SENHA</label><input id="p2" type="password" minlength="6" maxlength="128" autocomplete="new-password" required>
<button id="b" type="submit">TROCAR SENHA</button><p id="msg" role="status"></p></form>`,
    `<script>
const token=new URLSearchParams(location.search).get('token')||'';
const f=document.getElementById('f'),m=document.getElementById('msg'),b=document.getElementById('b');
const say=(t,c)=>{m.textContent=t;m.className=c};
f.addEventListener('submit',async e=>{e.preventDefault();
const p1=document.getElementById('p1').value,p2=document.getElementById('p2').value;
if(p1!==p2)return say('As senhas não são iguais.','err');
b.disabled=true;
try{const r=await fetch('/api/auth/reset-password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token,password:p1})});
const j=await r.json();
if(j.ok){f.querySelectorAll('input').forEach(i=>i.disabled=true);say('Senha trocada. Entre no jogo com a senha nova.','ok')}
else{b.disabled=false;say(j.message||'Não deu certo.','err')}}
catch{b.disabled=false;say('Sem conexão com o servidor.','err')}});
</script>`,
  );
}
