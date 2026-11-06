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
      "webhooks": [
        {
          "nome": "Campanha Orlando (todos os ingressos)",
          "url": "https://zaobtetbjpuzibjymhzw.supabase.co/functions/v1/campaign-webhook/ba048aaf-5aa2-4c29-a71f-d73d5fd8516a",
          "tiers": null,
          "para": "todos",
          "corpo": {
            "id": "{id}",
            "name": "{nome}",
            "email": "{email}",
            "phone": "{telefone}",
            "tag": "orlando"
          }
        },
        {
          "nome": "Orlando - Liberar ebook ingresso Standard",
          "url": "https://zaobtetbjpuzibjymhzw.supabase.co/functions/v1/campaign-webhook/0f44308d-d0bf-4c0a-8df5-869c6b8d27e5",
          "tiers": [
            "standard"
          ],
          "para": "todos",
          "corpo": {
            "nome": "{primeiro_nome}",
            "email": "{email}",
            "phone": "{telefone}",
            "cidade": "Orlando",
            "ingresso": "Standard"
          }
        }
      ]
    },
    "boston": {
      "slug": "boston",
      "cidade": "Boston",
      "uf": "MA",
      "inicio": "2026-12-04",
      "fim": "2026-12-05",
      "ano": 2026,
      "horarios": [
        "6:30pm–11pm",
        "8:30am–7pm"
      ],
      "datas_texto": "4 e 5 de dezembro de 2026",
      "tz": "America/New_York",
      "local": {
        "nome": "",
        "endereco": "",
        "endereco_exibicao": "",
        "maps_query": ""
      },
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
    }
  ],
  "entregas": {
    "standard": [],
    "vip": [],
    "rei": []
  }
};
