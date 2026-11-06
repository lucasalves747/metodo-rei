// Textos que o build monta sozinho (datas, preços, rótulos, SEO) em cada idioma.
// Para traduzir texto fixo dos modelos HTML use eventos/i18n/<lang>.json.

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export const L = {
  pt: {
    meses: ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"],
    mesesCurto: ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"],
    dias: ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"],
    diasCurto: ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"],
    e: "e",
    datas(d1, d2, m1, m2, y, umDia, mesmoMes) {
      const M = this.meses, C = this.mesesCurto;
      if (umDia) return { texto: `${d1} de ${M[m1]} de ${y}`, hero: `${d1} de ${cap(M[m1])}, ${y}`, card: `${d1} de ${M[m1]}`, curta: `${d1} ${C[m1]}` };
      if (mesmoMes) return { texto: `${d1} e ${d2} de ${M[m1]} de ${y}`, hero: `${d1} e ${d2} de ${cap(M[m1])}, ${y}`, card: `${d1}–${d2} de ${M[m1]}`, curta: `${d1}–${d2} ${C[m1]}` };
      return { texto: `${d1} de ${M[m1]} e ${d2} de ${M[m2]} de ${y}`, hero: `${d1} de ${cap(M[m1])} e ${d2} de ${cap(M[m2])}, ${y}`, card: `${d1} ${C[m1]} – ${d2} ${C[m2]}`, curta: `${d1} ${C[m1]}–${d2} ${C[m2]}` };
    },
    convidado: "Convidado desta edição",
    anterior: "Anterior", proximo: "Próximo", anteriorAria: "Mentor anterior", proximoAria: "Próximo mentor", mentoresAria: "Mentores desta edição",
    lerBio: "Ler bio completa",
    localDefinir: "Local a definir",
    prevendaPreco: "Preço de pré-venda!",
    agoraSo: "Agora<br>só",
    offTempo: (p) => `${p}% OFF<br>por tempo limitado`,
    economize: (p) => `Economize até <b>${p}% OFF!</b>`,
    tituloSufixo: (pv) => (pv ? "Pré-venda" : "Ingressos"),
    promo: `<div class="promo"><b>Pré-venda especial!</b>Economize em todos os ingressos</div>`,
    heroOffer: (pv) => (pv ? "Garanta a oferta de pré-venda" : "Garanta seu lugar"),
    durFacts: (n) => (n === 1 ? "1 dia presencial" : `${n} dias presenciais`),
    durAbout: (n) => (n === 1 ? "Um dia presencial" : n === 2 ? "Dois dias presenciais" : `${n} dias presenciais`),
    acesso: (n) => (n === 1 ? "Acesso ao dia completo de imersão" : `Acesso aos ${n} dias de imersão`),
    leadTitulo: (pv) => (pv ? "Garanta seu preço de pré-venda" : "Garanta seu ingresso"),
    skyline: (c) => `Skyline de ${c}`,
    garantirVaga: "Garantir minha vaga",
    lista: (n) => (n.length <= 1 ? n.join("") : n.slice(0, -1).join(", ") + " e " + n.at(-1)),
    // SEO
    eMais: (a, n) => `${a} e mais ${n} mentores`,
    umDia: "Um dia",
    nDias: (n) => `${n} dias`,
    pvSufixo: " · Pré-venda",
    seoEvento: ({ duracao, onde, quando, nomes, min }) => `${duracao} de imersão presencial em ${onde} (${quando}) para enriquecer com inteligência e governar a própria vida. Com ${nomes}. Ingressos a partir de US$${min}.`,
    ingresso: (n) => `Ingresso ${n}`,
    homeTitulo: (anos) => `Método REI · Imersão Presencial · Tour EUA ${anos}`,
    homeDesc: (lista) => `Imersão presencial para empresários e profissionais que decidiram enriquecer com inteligência e governar a própria vida.${lista ? ` Próximas edições: ${lista}.` : ""}`,
    proximas: "Próximas edições do Método REI",
    homeAlt: "Método REI — imersão presencial",
  },
  en: {
    meses: ["January","February","March","April","May","June","July","August","September","October","November","December"],
    mesesCurto: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],
    dias: ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"],
    diasCurto: ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"],
    e: "&",
    datas(d1, d2, m1, m2, y, umDia, mesmoMes) {
      const M = this.meses, C = this.mesesCurto;
      if (umDia) return { texto: `${M[m1]} ${d1}, ${y}`, hero: `${M[m1]} ${d1}, ${y}`, card: `${M[m1]} ${d1}`, curta: `${C[m1]} ${d1}` };
      if (mesmoMes) return { texto: `${M[m1]} ${d1}–${d2}, ${y}`, hero: `${M[m1]} ${d1}–${d2}, ${y}`, card: `${M[m1]} ${d1}–${d2}`, curta: `${C[m1]} ${d1}–${d2}` };
      return { texto: `${M[m1]} ${d1} – ${M[m2]} ${d2}, ${y}`, hero: `${M[m1]} ${d1} – ${M[m2]} ${d2}, ${y}`, card: `${C[m1]} ${d1} – ${C[m2]} ${d2}`, curta: `${C[m1]} ${d1}–${C[m2]} ${d2}` };
    },
    convidado: "Guest this edition",
    anterior: "Previous", proximo: "Next", anteriorAria: "Previous mentor", proximoAria: "Next mentor", mentoresAria: "Mentors at this edition",
    lerBio: "Read full bio",
    localDefinir: "Venue to be announced",
    prevendaPreco: "Pre-sale price!",
    agoraSo: "Now<br>only",
    offTempo: (p) => `${p}% OFF<br>for a limited time`,
    economize: (p) => `Save up to <b>${p}% OFF!</b>`,
    tituloSufixo: (pv) => (pv ? "Pre-sale" : "Tickets"),
    promo: `<div class="promo"><b>Special pre-sale!</b>Save on every ticket</div>`,
    heroOffer: (pv) => (pv ? "Lock in the pre-sale offer" : "Secure your seat"),
    durFacts: (n) => (n === 1 ? "1 in-person day" : `${n} in-person days`),
    durAbout: (n) => (n === 1 ? "One in-person day" : n === 2 ? "Two in-person days" : `${n} in-person days`),
    acesso: (n) => (n === 1 ? "Access to the full immersion day" : `Access to all ${n} immersion days`),
    leadTitulo: (pv) => (pv ? "Lock in your pre-sale price" : "Get your ticket"),
    skyline: (c) => `${c} skyline`,
    garantirVaga: "Secure my spot",
    lista: (n) => (n.length <= 1 ? n.join("") : n.length === 2 ? n.join(" and ") : n.slice(0, -1).join(", ") + " and " + n.at(-1)),
    eMais: (a, n) => `${a} and ${n} more mentors`,
    umDia: "One day",
    nDias: (n) => `${n} days`,
    pvSufixo: " · Pre-sale",
    seoEvento: ({ duracao, onde, quando, nomes, min }) => `${duracao} in-person immersion in ${onde} (${quando}) to build wealth wisely and govern your own life. With ${nomes}. Presented in Portuguese. Tickets from US$${min}.`,
    ingresso: (n) => `${n} ticket`,
    homeTitulo: (anos) => `Método REI · In-Person Immersion · US Tour ${anos}`,
    homeDesc: (lista) => `An in-person immersion for business owners and professionals who decided to build wealth wisely and govern their own lives. Presented in Portuguese.${lista ? ` Upcoming editions: ${lista}.` : ""}`,
    proximas: "Upcoming Método REI editions",
    homeAlt: "Método REI — in-person immersion",
  },
  es: {
    meses: ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"],
    mesesCurto: ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"],
    dias: ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"],
    diasCurto: ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"],
    e: "y",
    datas(d1, d2, m1, m2, y, umDia, mesmoMes) {
      const M = this.meses, C = this.mesesCurto;
      if (umDia) return { texto: `${d1} de ${M[m1]} de ${y}`, hero: `${d1} de ${M[m1]} de ${y}`, card: `${d1} de ${M[m1]}`, curta: `${d1} ${C[m1]}` };
      if (mesmoMes) return { texto: `${d1} y ${d2} de ${M[m1]} de ${y}`, hero: `${d1} y ${d2} de ${M[m1]} de ${y}`, card: `${d1}–${d2} de ${M[m1]}`, curta: `${d1}–${d2} ${C[m1]}` };
      return { texto: `${d1} de ${M[m1]} y ${d2} de ${M[m2]} de ${y}`, hero: `${d1} de ${M[m1]} y ${d2} de ${M[m2]} de ${y}`, card: `${d1} ${C[m1]} – ${d2} ${C[m2]}`, curta: `${d1} ${C[m1]}–${d2} ${C[m2]}` };
    },
    convidado: "Invitado de esta edición",
    anterior: "Anterior", proximo: "Siguiente", anteriorAria: "Mentor anterior", proximoAria: "Siguiente mentor", mentoresAria: "Mentores de esta edición",
    lerBio: "Leer biografía completa",
    localDefinir: "Lugar por confirmar",
    prevendaPreco: "¡Precio de preventa!",
    agoraSo: "Ahora<br>solo",
    offTempo: (p) => `${p}% OFF<br>por tiempo limitado`,
    economize: (p) => `Ahorra hasta <b>${p}% OFF!</b>`,
    tituloSufixo: (pv) => (pv ? "Preventa" : "Entradas"),
    promo: `<div class="promo"><b>¡Preventa especial!</b>Ahorra en todas las entradas</div>`,
    heroOffer: (pv) => (pv ? "Aprovecha la oferta de preventa" : "Asegura tu lugar"),
    durFacts: (n) => (n === 1 ? "1 día presencial" : `${n} días presenciales`),
    durAbout: (n) => (n === 1 ? "Un día presencial" : n === 2 ? "Dos días presenciales" : `${n} días presenciales`),
    acesso: (n) => (n === 1 ? "Acceso al día completo de inmersión" : `Acceso a los ${n} días de inmersión`),
    leadTitulo: (pv) => (pv ? "Asegura tu precio de preventa" : "Asegura tu entrada"),
    skyline: (c) => `Skyline de ${c}`,
    garantirVaga: "Asegurar mi lugar",
    lista: (n) => (n.length <= 1 ? n.join("") : n.slice(0, -1).join(", ") + " y " + n.at(-1)),
    eMais: (a, n) => `${a} y ${n} mentores más`,
    umDia: "Un día",
    nDias: (n) => `${n} días`,
    pvSufixo: " · Preventa",
    seoEvento: ({ duracao, onde, quando, nomes, min }) => `${duracao} de inmersión presencial en ${onde} (${quando}) para enriquecerte con inteligencia y gobernar tu propia vida. Con ${nomes}. En portugués. Entradas desde US$${min}.`,
    ingresso: (n) => `Entrada ${n}`,
    homeTitulo: (anos) => `Método REI · Inmersión Presencial · Gira EE. UU. ${anos}`,
    homeDesc: (lista) => `Inmersión presencial para empresarios y profesionales que decidieron enriquecerse con inteligencia y gobernar su propia vida. En portugués.${lista ? ` Próximas ediciones: ${lista}.` : ""}`,
    proximas: "Próximas ediciones del Método REI",
    homeAlt: "Método REI — inmersión presencial",
  },
};
