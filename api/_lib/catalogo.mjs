// GERADO por eventos/build.mjs a partir de eventos/eventos.json — não edite à mão.
export const CATALOGO = {
  "eventos": {
    "miami": {
      "slug": "miami",
      "cidade": "Miami",
      "uf": "FL",
      "inicio": "2026-10-23",
      "fim": "2026-10-24",
      "ano": 2026,
      "esgotado": false,
      "horarios": [
        "6:30pm–11pm",
        "8:30am–8pm"
      ],
      "datas_texto": "23 e 24 de outubro de 2026",
      "tz": "America/New_York",
      "local": {
        "nome": "Lagoinha Miami Church",
        "endereco": "295 NE 59th Terrace, Miami, FL",
        "endereco_exibicao": "",
        "maps_query": "Lagoinha+Miami+Church+295+NE+59th+Terrace+Miami+FL+33137"
      },
      "marca": "Método REI",
      "zelle": null,
      "tiers": {
        "standard": {
          "nome": "Standard",
          "preco": 14
        },
        "vip": {
          "nome": "VIP",
          "preco": 47
        },
        "rei": {
          "nome": "REI",
          "preco": 197
        }
      },
      "webhooks": []
    },
    "orlando": {
      "slug": "orlando",
      "cidade": "Orlando",
      "uf": "FL",
      "inicio": "2026-11-21",
      "fim": "2026-11-21",
      "ano": 2026,
      "esgotado": true,
      "horarios": [
        "8:30am–5:30pm"
      ],
      "datas_texto": "21 de novembro de 2026",
      "tz": "America/New_York",
      "local": {
        "nome": "Winter Garden, FL",
        "endereco": "17800 Bali Blvd, Winter Garden, FL 34787",
        "endereco_exibicao": "",
        "maps_query": "17800+Bali+Blvd+Winter+Garden+FL+34787"
      },
      "marca": "Método REI",
      "zelle": null,
      "tiers": {
        "standard": {
          "nome": "Standard",
          "preco": 60
        },
        "vip": {
          "nome": "VIP",
          "preco": 97
        },
        "rei": {
          "nome": "REI",
          "preco": 197
        }
      },
      "webhooks": []
    },
    "experience-orlando": {
      "slug": "experience-orlando",
      "cidade": "Orlando",
      "uf": "FL",
      "inicio": "2026-11-21",
      "fim": "2026-11-21",
      "ano": 2026,
      "esgotado": false,
      "horarios": [
        "12pm–5pm"
      ],
      "datas_texto": "21 de novembro de 2026",
      "tz": "America/New_York",
      "local": {
        "nome": "Adega Gaúcha",
        "endereco": "7804 W Irlo Bronson Memorial Hwy, Kissimmee, FL 34747",
        "endereco_exibicao": "Adega Gaúcha · 7804 W Irlo Bronson Memorial Hwy, Kissimmee, FL",
        "maps_query": ""
      },
      "marca": "REI Experience",
      "zelle": {
        "email": "globalusatraining@gmail.com",
        "whatsapp": "13053705595"
      },
      "tiers": {
        "standard": {
          "nome": "Individual",
          "preco": 120
        },
        "vip": {
          "nome": "Casal",
          "preco": 200
        }
      },
      "webhooks": []
    },
    "boston": {
      "slug": "boston",
      "cidade": "Boston",
      "uf": "MA",
      "inicio": "2026-12-05",
      "fim": "2026-12-05",
      "ano": 2026,
      "esgotado": false,
      "horarios": [
        "8:30am–7pm"
      ],
      "datas_texto": "5 de dezembro de 2026",
      "tz": "America/New_York",
      "local": {
        "nome": "",
        "endereco": "",
        "endereco_exibicao": "",
        "maps_query": ""
      },
      "marca": "Método REI",
      "zelle": null,
      "tiers": {
        "standard": {
          "nome": "Standard",
          "preco": 14
        },
        "vip": {
          "nome": "VIP",
          "preco": 47
        },
        "rei": {
          "nome": "REI",
          "preco": 197
        }
      },
      "webhooks": []
    }
  },
  "cupons": [
    {
      "codigo": "TESTE10",
      "tipo": "percentual",
      "valor": 10,
      "somente_teste": true
    },
    {
      "codigo": "TESTE100",
      "tipo": "percentual",
      "valor": 100,
      "somente_teste": true
    },
    {
      "codigo": "REIFREE1126",
      "tipo": "percentual",
      "valor": 100
    },
    {
      "codigo": "ORLANDO20",
      "tipo": "percentual",
      "valor": 20,
      "eventos": [
        "orlando"
      ],
      "valido_ate": "2026-11-20T13:00:00-05:00"
    },
    {
      "codigo": "LEGENDARIOS",
      "tipo": "percentual",
      "valor": 100,
      "eventos": [
        "orlando",
        "boston"
      ],
      "tiers": [
        "vip"
      ]
    },
    {
      "codigo": "PATY",
      "tipo": "percentual",
      "valor": 100,
      "eventos": [
        "orlando",
        "boston"
      ],
      "tiers": [
        "vip"
      ]
    },
    {
      "codigo": "VERTEX",
      "tipo": "fixo",
      "valor": 172,
      "eventos": [
        "boston"
      ],
      "tiers": [
        "standard"
      ]
    },
    {
      "codigo": "LGND",
      "tipo": "fixo",
      "valor": 172,
      "eventos": [
        "orlando",
        "boston"
      ]
    },
    {
      "codigo": "MREIB50",
      "tipo": "percentual",
      "valor": 50,
      "eventos": [
        "boston"
      ],
      "tiers": [
        "standard"
      ]
    },
    {
      "codigo": "BRASILEIRAS00F",
      "tipo": "percentual",
      "valor": 100,
      "eventos": [
        "orlando",
        "boston"
      ]
    },
    {
      "codigo": "BRASILEIRAS",
      "tipo": "percentual",
      "valor": 75,
      "eventos": [
        "orlando",
        "boston"
      ]
    },
    {
      "codigo": "REIDALL100",
      "tipo": "percentual",
      "valor": 100,
      "eventos": [
        "boston"
      ],
      "tiers": [
        "standard"
      ]
    },
    {
      "codigo": "REIBOS100",
      "tipo": "percentual",
      "valor": 100,
      "eventos": [
        "boston"
      ],
      "tiers": [
        "standard"
      ]
    },
    {
      "codigo": "REIBOS150",
      "tipo": "fixo",
      "valor": 150,
      "eventos": [
        "boston"
      ],
      "tiers": [
        "standard"
      ]
    },
    {
      "codigo": "MRFREE100",
      "tipo": "percentual",
      "valor": 100,
      "eventos": [
        "orlando",
        "boston"
      ]
    }
  ],
  "entregas": {
    "standard": [],
    "vip": [],
    "rei": []
  }
};
