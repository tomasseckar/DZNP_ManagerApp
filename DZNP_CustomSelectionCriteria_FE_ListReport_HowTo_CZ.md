# DZNP Manager – vlastní „Výběrová kritéria“ nad List Reportem (Fiori Elements V4)
*(step-by-step návod + vysvětlení, proč je to ohnuté a na co si dát pozor)*

> **Cíl:** Schovat standardní FE FilterBar a místo něj zobrazit vlastní blok „Výběrová kritéria“ nad tabulkou v **Fiori Elements List Report (OData V4)**.  
> **Výsledek:** Vložíme vlastní fragment nad tabulku tak, že zabalíme obsah `sap.f.DynamicPage.content` (0..1) do `sap.m.VBox` (multi) a vložíme fragment jako první položku.

---

## 1) Proč to nešlo “normálně”
### 1.1 List Report view negeneruješ ty
List Report (LR) je generovaný runtime-ově šablonou `sap.fe.templates`. Neexistuje „tvůj“ XML view, do kterého bys jen doplnil `<Panel/>`.

### 1.2 Kardinalita `DynamicPage.content` je 0..1
V tvém runtime je hlavní obal LR stránky typicky `sap.f.DynamicPage`. Jeho agregace `content` má kardinalitu **0..1** (jeden control).  
Proto nejde:
- `insertAggregation("content", ...)`  
a padá to na chybu „wrong cardinality (0..1)“.

### 1.3 Funkční workaround
Uděláš z `DynamicPage.content` kontejner `VBox` (který může mít více dětí):
1) vytvoříš `VBox`
2) přidáš do něj **vlastní panel** (fragment)
3) přidáš do něj původní content (tabulka atd.)
4) nastavíš `DynamicPage.content = VBox`

---

## 2) Prerekvizity / kontrola projektu
### 2.1 Unikátní ID ve fragmentech (flexEnabled = true)
Protože máš v manifestu `flexEnabled: true`, **všechny UI prvky ve fragmentech musí mít unikátní `id`**.

### 2.2 Knihovna pro SimpleForm
Pokud používáš `sap.ui.layout.form.SimpleForm`, přidej do manifestu knihovnu `sap.ui.layout`.

V `manifest.json`:

```json
"sap.ui5": {
  "dependencies": {
    "libs": {
      "sap.m": {},
      "sap.ui.core": {},
      "sap.fe.templates": {},
      "sap.ui.layout": {}
    }
  }
}
```

---

## 3) Implementace krok za krokem

### Krok 3.1 – Vytvoř fragment s UI „Výběrová kritéria“
Vytvoř/nahraď soubor:

`webapp/ext/fragment/CustomFilterBar.fragment.xml`

```xml
<core:FragmentDefinition
  xmlns:core="sap.ui.core"
  xmlns="sap.m"
  xmlns:form="sap.ui.layout.form">

  <Panel id="dznpCustomCriteriaPanel" expandable="false" class="sapUiSmallMargin">
    <content>

      <form:SimpleForm
        id="dznpCustomCriteriaForm"
        editable="true"
        layout="ResponsiveGridLayout"
        labelSpanXL="2"
        labelSpanL="3"
        labelSpanM="4"
        labelSpanS="12"
        columnsXL="2"
        columnsL="2"
        columnsM="1">

        <Label id="dznpLblYear" text="Rok" />
        <Input id="dznpInpYear" width="10rem" />

        <Label id="dznpLblApprover" text="Schvalovatel" />
        <HBox id="dznpBxApprover">
          <Input id="dznpInpApprover" width="10rem" editable="false" />
          <Text id="dznpTxtApproverName" text="" class="sapUiTinyMarginBegin"/>
        </HBox>

        <Label id="dznpLblScope" text="Sestava za" />
        <RadioButtonGroup id="dznpRbScope" columns="2" select=".onScopeChanged">
          <buttons>
            <RadioButton id="dznpRbMgr" text="Vedoucí" selected="true"/>
            <RadioButton id="dznpRbOrg" text="Organizační jednotku"/>
          </buttons>
        </RadioButtonGroup>

        <Label id="dznpLblOrgUnit" text="Org. jednotka" />
        <ComboBox id="dznpCbOrgUnit" enabled="false" placeholder="Organizační jednotka..." />

      </form:SimpleForm>

      <Text id="dznpCustomCriteriaDebug"
            text="DEBUG: Custom criteria fragment loaded ✅"
            class="sapUiTinyMarginBegin"/>
    </content>
  </Panel>

</core:FragmentDefinition>
```

**Poznámka:** Nepoužívej `sap.ui.mdc.filterbar.*`, pokud nechceš řešit verzní kompatibilitu MDC API. Zůstaň u `sap.m` + `sap.ui.layout`.

---

### Krok 3.2 – Zaregistruj controller extension v manifestu
V `manifest.json` ověř, že máš controller extension pro ListReport:

```json
"sap.ui5": {
  "extends": {
    "extensions": {
      "sap.ui.controllerExtensions": {
        "sap.fe.templates.ListReport.ListReportController": {
          "controllerName": "dznp.ext.controller.ListReport"
        }
      }
    }
  }
}
```

---

### Krok 3.3 – Implementuj injekci fragmentu do UI (VBox wrap)
Vytvoř/nahraď soubor:

`webapp/ext/controller/ListReport.controller.js`

```js
sap.ui.define([
  "sap/ui/core/mvc/ControllerExtension",
  "sap/ui/core/Fragment"
], function (ControllerExtension, Fragment) {
  "use strict";

  return ControllerExtension.extend("dznp.ext.controller.ListReport", {
    override: {
      // Po renderu už existuje UI strom (DynamicPage + TableAPI), takže se dá bezpečně zasáhnout
      onAfterRendering: function () {
        this._injectCriteriaAboveTable();
      }
    },

    // Handler z fragmentu (RadioButtonGroup select=".onScopeChanged")
    onScopeChanged: function (oEvent) {
      const iIdx = oEvent.getSource().getSelectedIndex(); // 0 = Vedoucí, 1 = Org
      const bOrg = iIdx === 1;

      const oView = this.base.getView();
      const oCB = oView.byId("dznpCbOrgUnit") || sap.ui.getCore().byId("dznpCbOrgUnit");
      if (oCB) {
        oCB.setEnabled(bOrg);
      }
    },

    _injectCriteriaAboveTable: async function () {
      try {
        // idempotence: FE může re-renderovat → nechceme vkládat 2×
        if (this._bInjected) return;

        const oView = this.base.getView();

        // 1) Najdi FE TableAPI macro (kotva)
        const aTableApi = oView.findAggregatedObjects(true, function (o) {
          return o && o.isA && o.isA("sap.fe.macros.table.TableAPI");
        });

        const oTableApi = aTableApi && aTableApi[0];
        if (!oTableApi) {
          console.warn("DZNP: TableAPI not found yet, retry...");
          setTimeout(this._injectCriteriaAboveTable.bind(this), 300);
          return;
        }

        // 2) Parent TableAPI (u tebe sap.f.DynamicPage)
        const oParent = oTableApi.getParent();
        if (!oParent) {
          console.warn("DZNP: TableAPI parent not found");
          return;
        }

        console.log(
          "DZNP: TableAPI parent =", oParent.getMetadata().getName(),
          "parentAggr =", oTableApi.sParentAggregationName
        );

        // 3) Načti fragment jen jednou
        if (!this._oCriteriaFrag) {
          this._oCriteriaFrag = await Fragment.load({
            name: "dznp.ext.fragment.CustomFilterBar",
            controller: this
          });
        }

        // 4) DynamicPage.content je 0..1 → zabal do VBox
        if (oParent.isA && oParent.isA("sap.f.DynamicPage")) {
          const sAggr = "content";
          const oOldContent = oParent.getAggregation(sAggr); // 0..1

          // Pokud už je jednou zabalené, skonči
          if (oOldContent && oOldContent.isA && oOldContent.isA("sap.m.VBox") &&
              oOldContent.data("dznpWrapped") === true) {
            console.log("DZNP: DynamicPage.content already wrapped");
            this._bInjected = true;
            return;
          }

          const oBox = new sap.m.VBox({ width: "100%" });
          oBox.data("dznpWrapped", true);

          // Náš panel navrch
          oBox.addItem(this._oCriteriaFrag);

          // Původní content pod panel
          if (oOldContent) {
            oParent.setAggregation(sAggr, null);
            oBox.addItem(oOldContent);
          }

          // Nastav VBox jako nový content
          oParent.setAggregation(sAggr, oBox);

          this._bInjected = true;
          console.log("DZNP: Wrapped DynamicPage.content with VBox and inserted criteria ✅");
          return;
        }

        console.warn("DZNP: Parent is not sap.f.DynamicPage – runtime struktura se změnila.");
      } catch (e) {
        console.error("DZNP: _injectCriteriaAboveTable FAILED", e);
      }
    }
  });
});
```

---

## 4) Spuštění a ověření, že to funguje
### 4.1 Doporučené spuštění pro debug
- `npm run start-noflp` (když nechceš FLP preview)
- nebo standardně `npm run start`
- hard refresh (Ctrl+Shift+R)

### 4.2 Ověření v konzoli
Musíš vidět logy:
- `DZNP: TableAPI parent = sap.f.DynamicPage parentAggr = content`
- `DZNP: Wrapped DynamicPage.content with VBox and inserted criteria ✅`

### 4.3 Ověření v UI
Nad tabulkou se musí objevit panel a debug text:
- `DEBUG: Custom criteria fragment loaded ✅`

---

## 5) Nejčastější problémy a řešení
### 5.1 „…can't have an empty ID attribute when flexEnabled is true“
→ Vše ve fragmentu musí mít `id` a musí být unikátní.

### 5.2 „wrong cardinality (declared as 0..1)“
→ Použil jsi `insertAggregation` / `add...` do `DynamicPage.content`.  
Správně je wrapper `VBox` + `setAggregation`.

### 5.3 MDC chyby „FilterItem / FilterBar neexistuje“
→ Nepoužívat `sap.ui.mdc.filterbar.*` (nebo trefit přesnou MDC strukturu pro danou verzi – samostatná kapitola).

### 5.4 Nic se nezobrazuje, ale fragment se loaduje
→ Zkontroluj, že injekce proběhla (✅ log).  
Pokud ano, je možné že jsi vložil panel do špatného parentu (jiný runtime strom). Pak:
- loguj `oParent.getMetadata().getName()`
- případně hledej jiný parent (např. `getParent().getParent()`), ale u tebe to vyšlo přes `DynamicPage`.

---

## 6) Je to “stable” a je to dobrá cesta?
### Realisticky:
- **Je to funkční workaround** a pro on-prem projekt s fixní UI5 baseline to může být OK.
- Je to ale **zásah do FE runtime layoutu**, který se může změnit při upgrade UI5 / FE šablon.

### Co pomáhá stabilitě:
- idempotence (`_bInjected`, `dznpWrapped`)
- retry, když TableAPI ještě není v DOM

### Dlouhodobě stabilnější alternativy:
- použít standard FilterBar a jen ho „zkrotit“ (mandatory, defaulty, value helps, skrytí polí)
- `@UI.selectionFields` v CDS + adaptace (nejstabilnější)

> Doporučení: ber tento VBox-wrap postup jako pragmatické řešení, ale po každém větším upgrade UI5 udělej rychlý regression test.

---

## 7) Mini checklist pro replikaci
1) Přidej `sap.ui.layout` do libs  
2) Vytvoř fragment (unikátní ID)  
3) Zaregistruj controller extension v manifestu  
4) V controlleru: najdi `TableAPI` → parent `DynamicPage` → wrap do `VBox`  
5) Ověř logy + debug text v UI

