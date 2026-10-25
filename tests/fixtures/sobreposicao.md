# Sobreposição: o documento não cobre a interface

Cada bloco abaixo tenta desenhar por cima da barra do app.

<div id="ov-fixed" style="position:fixed;top:0;left:0;right:0;height:40px;background:#9e1327;z-index:99;color:#fff">OVERLAY-FIXED</div>

<div id="ov-var" style="--p:fixed;position:var(--p);top:0;left:0;right:0;height:40px;background:#9e1327;z-index:99">OVERLAY-VAR</div>

<div id="ov-drop" class="drop" style="inset:0;pointer-events:auto;background:#fff;z-index:99">OVERLAY-DROP</div>

<div id="ov-attr" data-p="fixed" style="position:attr(data-p type(*));top:0;left:0;right:0;height:40px;background:#9e1327;z-index:99">OVERLAY-ATTR</div>

<div id="ov-abs" style="position:absolute;top:-500px;left:0;right:0;height:40px;background:#9e1327;z-index:99">OVERLAY-ABS</div>

<div id="ov-abs2" style="position:absolute;top:-60px;left:0;right:0;height:50px;background:#9e1327;z-index:1">OVERLAY-ABS-AVISO</div>

<button id="ov-cmd" command="show-modal" commandfor="ov-dialog">Continuar</button>
<dialog id="ov-dialog" style="width:100vw;height:100vh;max-width:none;max-height:none;margin:0;inset:0;border:0">OVERLAY-DIALOG</dialog>

<img src="https://example.com/aviso.png" alt="imagem remota, para o aviso aparecer">

Texto normal depois dos blocos.
