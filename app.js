document.querySelectorAll('nav button').forEach(b=>b.addEventListener('click',()=>{
 document.querySelectorAll('nav button,.tab').forEach(x=>x.classList.remove('active'));
 b.classList.add('active');document.getElementById(b.dataset.tab).classList.add('active');
}));
function togglePaid(btn){
 const badge=btn.closest('.card').querySelector('.badge');
 const paid=badge.classList.contains('paid');
 if(paid){badge.className='badge unpaid';badge.textContent='DA PAGARE';btn.textContent='Segna come pagata';document.getElementById('daPagare').textContent='€ 197,60'}
 else{badge.className='badge paid';badge.textContent='PAGATA';btn.textContent='Segna come da pagare';document.getElementById('daPagare').textContent='€ 0,00'}
 localStorage.setItem('fattura26909054_paid',String(!paid));
}
if(localStorage.getItem('fattura26909054_paid')==='true') togglePaid(document.querySelector('.pay'));
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');