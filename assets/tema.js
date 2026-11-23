(function(){
var r=document.documentElement,k="tb-tema",m=matchMedia("(prefers-color-scheme: dark)");
function get(){try{return localStorage.getItem(k)}catch(e){return null}}
function dark(){var t=r.getAttribute("data-theme");return t?t==="dark":m.matches}
function sync(){r.classList.toggle("is-dark",dark());var b=document.querySelector(".tema");if(b){var d=dark();b.setAttribute("aria-pressed",String(d));b.setAttribute("aria-label",(r.lang==="tr")?(d?"Gündüze geç":"Geceye geç"):(d?"Switch to day":"Switch to night"));}var c=getComputedStyle(r).getPropertyValue("--bg").trim();document.querySelectorAll('meta[name="theme-color"]').forEach(function(x){x.setAttribute("content",c)})}
var s=get();if(s)r.setAttribute("data-theme",s);sync();
m.addEventListener&&m.addEventListener("change",sync);
document.addEventListener("DOMContentLoaded",function(){sync();var b=document.querySelector(".tema");if(!b)return;b.addEventListener("click",function(){var n=dark()?"light":"dark";r.setAttribute("data-theme",n);try{localStorage.setItem(k,n)}catch(e){}sync()})});
})();
