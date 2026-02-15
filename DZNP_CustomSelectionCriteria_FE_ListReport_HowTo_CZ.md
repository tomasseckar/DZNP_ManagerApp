# DZNP Manager – vlastní „Výběrová kritéria“ nad List Reportem (Fiori Elements V4)
*(step-by-step návod v češtině + vysvětlení, proč je to ohnuté a na co si dát pozor)*

> **Cíl:** Schovat standardní FE FilterBar a místo něj zobrazit vlastní blok „Výběrová kritéria“ nad tabulkou v **Fiori Elements List Report (OData V4)**.  
> **Výsledek:** Vložíme vlastní fragment nad tabulku tak, že zabalíme obsah `sap.f.DynamicPage.content` (0..1) do `sap.m.VBox` (multi) a vložíme fragment jako první položku.


## Obsah

- [1) Proč to nešlo "normálně"](#1-proč-to-nešlo-normálně)
- [2) Prerekvizity / kontrola projektu](#2-prerekvizity--kontrola-projektu)
- [3) Implementace krok za krokem](#3-implementace-krok-za-krokem)
- [4) Spuštění a ověření, že to funguje](#4-spuštění-a-ověření-že-to-funguje)
- [5) Nejčastější problémy a řešení](#5-nejčastější-problémy-a-řešení)
- [6) Je to "stable" a je to dobrá cesta?](#6-je-to-stable-a-je-to-dobrá-cesta)
- [7) Mini checklist pro replikaci](#7-mini-checklist-pro-replikaci)
- [8) Předvyplnění pole Schvalovatel (uživatel z FLP vs DEFAULT_USER)](#8-předvyplnění-pole-schvalovatel-uživatel-z-flp-vs-default_user)
- [9) Organizační jednotky – value help omezený podle schvalovatele + napojení na FE filtry](#9-Organizační-jednotky–value-help-omezený-podle-schvalovatele-+-napojení-na-FE-filtry)

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


---

## 8) Předvyplnění pole Schvalovatel (uživatel z FLP vs DEFAULT_USER)

### 8.1 Proč v BAS často vidíš `DEFAULT_USER`
Když aplikaci spouštíš lokálně přes Fiori tools (`fiori run`) a otvíráš ji v **FLP sandboxu** (`test/flp.html#app-preview`), nejedeš proti reálnému ABAP FLP (Launchpadu) a často ani nemáš přihlášení jako „skutečný“ uživatel. Proto je v sandboxu typicky k dispozici jen „dummy“ uživatel (často právě **`DEFAULT_USER`**).

- V **reálném FLP na ABAPu** (otevřené jako tile v systému) se `sap.ushell.Container` napojí na skutečný runtime a `UserInfo` vrátí reálného uživatele.
- V **BAS / lokálním sandboxu** je `UserInfo` buď nedostupné, nebo vrací defaultního uživatele.

Proto dává smysl mít v kódu:
1) pokus o získání uživatele přes `sap.ushell` (když běží FLP)
2) **fallback** na `DEFAULT_USER` (aby UI fungovalo i lokálně)

### 8.2 Co přesně chceme udělat
Chceme při startu obrazovky automaticky doplnit:
- `dznpInpApprover` (Input) → uživatelské jméno / id (např. `WOZNIAK2`)
- `dznpTxtApproverName` (Text) → celé jméno (pokud ho umíme získat)

> Důležité: protože fragment vkládáme dynamicky po renderu, **nemůžeš spoléhat na `this.base.getView().byId(...)`**. Nejjednodušší je používat `sap.ui.getCore().byId(...)` a zároveň mít malý retry, kdyby se UI ještě nestihlo vytvořit.

### 8.3 Krok za krokem (co změnit v kódu)

#### Krok 1 – Ujisti se, že fragment má správné ID
V souboru `webapp/ext/fragment/CustomFilterBar.fragment.xml` musí být inputy přesně takto (už je máš):

```xml
<Label id="dznpLblApprover" text="Schvalovatel" />
<HBox id="dznpBxApprover">
  <Input id="dznpInpApprover" width="10rem" editable="false" />
  <Text id="dznpTxtApproverName" text="" class="sapUiTinyMarginBegin"/>
</HBox>
```

#### Krok 2 – Přidej do controlleru helper na získání uživatele
Do `webapp/ext/controller/ListReport.controller.js` přidej metodu `_getCurrentUserSafe()`:

```js
_getCurrentUserSafe: async function () {
  // Default pro BAS / lokální sandbox
  const oFallback = { id: "DEFAULT_USER", fullName: "Default User" };

  try {
    // sap.ushell je dostupné jen ve FLP runtime (ne v čistém index.html)
    if (!sap.ushell || !sap.ushell.Container) {
      return oFallback;
    }

    // Novější API: getServiceAsync
    if (sap.ushell.Container.getServiceAsync) {
      const oUserInfo = await sap.ushell.Container.getServiceAsync("UserInfo");
      const oUser = oUserInfo && oUserInfo.getUser && oUserInfo.getUser();
      if (!oUser) return oFallback;

      const sId = (oUser.getId && oUser.getId()) || oUser.getId || oFallback.id;
      const sFullName = (oUser.getFullName && oUser.getFullName()) || oUser.getFullName || "";
      return { id: sId || oFallback.id, fullName: sFullName || oFallback.fullName };
    }

    // Starší API: getService
    if (sap.ushell.Container.getService) {
      const oUserInfo = sap.ushell.Container.getService("UserInfo");
      const oUser = oUserInfo && oUserInfo.getUser && oUserInfo.getUser();
      if (!oUser) return oFallback;

      const sId = (oUser.getId && oUser.getId()) || oUser.getId || oFallback.id;
      const sFullName = (oUser.getFullName && oUser.getFullName()) || oUser.getFullName || "";
      return { id: sId || oFallback.id, fullName: sFullName || oFallback.fullName };
    }

    return oFallback;
  } catch (e) {
    console.warn("DZNP: UserInfo not available, using fallback", e);
    return oFallback;
  }
}
```

#### Krok 3 – Přidej helper na bezpečné získání controlů (core.byId + retry)
Do stejného controlleru přidej metodu `_setApproverFieldsWithRetry()`:

```js
_setApproverFieldsWithRetry: async function (iAttempt) {
  const iTry = iAttempt || 1;

  const oInp = sap.ui.getCore().byId("dznpInpApprover");
  const oTxt = sap.ui.getCore().byId("dznpTxtApproverName");

  // UI ještě není hotové → chvíli počkej a zkus znovu
  if ((!oInp || !oTxt) && iTry <= 10) {
    setTimeout(this._setApproverFieldsWithRetry.bind(this, iTry + 1), 150);
    return;
  }

  if (!oInp || !oTxt) {
    console.warn("DZNP: Approver controls not found (dznpInpApprover / dznpTxtApproverName)");
    return;
  }

  const oUser = await this._getCurrentUserSafe();

  oInp.setValue(oUser.id);
  oTxt.setText(oUser.fullName || "");

  console.log("DZNP: Approver filled:", oUser.id, oUser.fullName);
}
```

#### Krok 4 – Zavolej naplnění Schvalovatele až po vložení fragmentu do stránky
V metodě `_injectCriteriaAboveTable()` (tam, kde po úspěšném zabalení `DynamicPage.content` nastavuješ `_bInjected = true`) přidej volání:

```js
// ... po úspěšném vložení fragmentu do VBox (a po setAggregation)
this._bInjected = true;

// Naplň schvalovatele (později – až bude UI opravdu v DOM)
this._setApproverFieldsWithRetry(1);

console.log("DZNP: Wrapped DynamicPage.content with VBox and inserted criteria ✅");
return;
```

> Proč retry: FE runtime a render může být ještě „v pohybu“ a někdy se stane, že hned po `setAggregation` ještě nejsou všechny prvky zaregistrované v Core.

### 8.4 Kompletní ukázka (jen relevantní části controlleru)
Aby se ti to dobře kopírovalo, tady je „skelet“ s místy, kam to patří:

```js
sap.ui.define([
  "sap/ui/core/mvc/ControllerExtension",
  "sap/ui/core/Fragment"
], function (ControllerExtension, Fragment) {
  "use strict";

  return ControllerExtension.extend("dznp.ext.controller.ListReport", {
    override: {
      onAfterRendering: function () {
        this._injectCriteriaAboveTable();
      }
    },

    onScopeChanged: function (oEvent) {
      const iIdx = oEvent.getSource().getSelectedIndex();
      const bOrg = iIdx === 1;

      const oCB = sap.ui.getCore().byId("dznpCbOrgUnit");
      if (oCB) {
        oCB.setEnabled(bOrg);
      }
    },

    _getCurrentUserSafe: async function () {
      const oFallback = { id: "DEFAULT_USER", fullName: "Default User" };

      try {
        if (!sap.ushell || !sap.ushell.Container) {
          return oFallback;
        }

        if (sap.ushell.Container.getServiceAsync) {
          const oUserInfo = await sap.ushell.Container.getServiceAsync("UserInfo");
          const oUser = oUserInfo && oUserInfo.getUser && oUserInfo.getUser();
          if (!oUser) return oFallback;

          const sId = (oUser.getId && oUser.getId()) || oUser.getId || oFallback.id;
          const sFullName = (oUser.getFullName && oUser.getFullName()) || oUser.getFullName || "";
          return { id: sId || oFallback.id, fullName: sFullName || oFallback.fullName };
        }

        if (sap.ushell.Container.getService) {
          const oUserInfo = sap.ushell.Container.getService("UserInfo");
          const oUser = oUserInfo && oUserInfo.getUser && oUserInfo.getUser();
          if (!oUser) return oFallback;

          const sId = (oUser.getId && oUser.getId()) || oUser.getId || oFallback.id;
          const sFullName = (oUser.getFullName && oUser.getFullName()) || oUser.getFullName || "";
          return { id: sId || oFallback.id, fullName: sFullName || oFallback.fullName };
        }

        return oFallback;
      } catch (e) {
        console.warn("DZNP: UserInfo not available, using fallback", e);
        return oFallback;
      }
    },

    _setApproverFieldsWithRetry: async function (iAttempt) {
      const iTry = iAttempt || 1;
      const oInp = sap.ui.getCore().byId("dznpInpApprover");
      const oTxt = sap.ui.getCore().byId("dznpTxtApproverName");

      if ((!oInp || !oTxt) && iTry <= 10) {
        setTimeout(this._setApproverFieldsWithRetry.bind(this, iTry + 1), 150);
        return;
      }

      if (!oInp || !oTxt) {
        console.warn("DZNP: Approver controls not found");
        return;
      }

      const oUser = await this._getCurrentUserSafe();
      oInp.setValue(oUser.id);
      oTxt.setText(oUser.fullName || "");
      console.log("DZNP: Approver filled:", oUser.id, oUser.fullName);
    },

    _injectCriteriaAboveTable: async function () {
      try {
        if (this._bInjected) return;

        const oView = this.base.getView();

        const aTableApi = oView.findAggregatedObjects(true, function (o) {
          return o && o.isA && o.isA("sap.fe.macros.table.TableAPI");
        });

        const oTableApi = aTableApi && aTableApi[0];
        if (!oTableApi) {
          setTimeout(this._injectCriteriaAboveTable.bind(this), 300);
          return;
        }

        const oParent = oTableApi.getParent();
        if (!oParent) return;

        if (!this._oCriteriaFrag) {
          this._oCriteriaFrag = await Fragment.load({
            name: "dznp.ext.fragment.CustomFilterBar",
            controller: this
          });
        }

        if (oParent.isA && oParent.isA("sap.f.DynamicPage")) {
          const sAggr = "content";
          const oOldContent = oParent.getAggregation(sAggr);

          if (oOldContent && oOldContent.isA && oOldContent.isA("sap.m.VBox") &&
              oOldContent.data("dznpWrapped") === true) {
            this._bInjected = true;
            return;
          }

          const oBox = new sap.m.VBox({ width: "100%" });
          oBox.data("dznpWrapped", true);

          oBox.addItem(this._oCriteriaFrag);

          if (oOldContent) {
            oParent.setAggregation(sAggr, null);
            oBox.addItem(oOldContent);
          }

          oParent.setAggregation(sAggr, oBox);

          this._bInjected = true;
          this._setApproverFieldsWithRetry(1);
          console.log("DZNP: Wrapped DynamicPage.content with VBox and inserted criteria ✅");
          return;
        }

      } catch (e) {
        console.error("DZNP: _injectCriteriaAboveTable FAILED", e);
      }
    }
  });
});
```

### 8.5 Jak si ověřit, že to běží správně
1) Otevři aplikaci ve FLP (ideálně reálný ABAP FLP) → v poli Schvalovatel uvidíš svůj skutečný `sy-uname` / uživatele.
2) V BAS sandboxu je OK, že uvidíš `DEFAULT_USER` (není to chyba tvého kódu, ale prostředí).
3) V konzoli uvidíš log `DZNP: Approver filled: ...`.


## 9 Organizační jednotky – value help omezený podle schvalovatele + napojení na FE filtry

### 9.1 Stav aktuálně
- V UI už vidíme seznam organizačních jednotek v našem vlastním fragmentu (ComboBox). 
- Backend má logiku “kdo je schvalovatel → jaké OU může vidět” už dnes v ABAPu (viz `ZCL_HR_DZNP_SCOPE`), ale **stávající CDS value help `ZI/ZC_DZNP_OrgUnitVH` je “globální”** (bere všechny OU) – proto to zatím není omezené.  
- V BAS / lokálním běhu mimo FLP se v UserInfo často vrací `DEFAULT_USER`. To je normální – lokální sandbox/mock nemá reálný FLP user kontext.

### 9.2 Co upravit v backendu (aby OU byly “jen moje”)
Nejstabilnější cesta pro “omezený seznam podle uživatele” je udělat **custom entity (query)** implementovanou v ABAPu a v ní už řezat data podle `sy-uname` (nebo podle schvalovatele, pokud ho budeš posílat jako parametr).

**Varianta A (doporučená): custom entity implementovaná ABAPem**
1) Vytvoř custom entity např. `ZI_DZNP_OrgUnitVH_User` a query provider třídu (např. `ZCL_DZNP_ORGUNIT_VH_QP`).  
2) V query provideru:
   - zjisti uživatele: `sy-uname`
   - použij existující logiku: `ZCL_HR_DZNP_SCOPE=>GET_ORGUNITS_FOR_MANAGER( iv_uname = sy-uname … )`
   - vracej pouze OU z výsledku (Key + Text).
3) Exponuj ji ve službě stejně, jako už exponuješ `OrgUnitVH`.

**Proč ABAP query provider?**  
Protože standardní CDS view neumí “zavolat ABAP metodu”. A tvoje logika (manager → OU) je už dnes v ABAPu – takže custom entity je nejrychlejší a nejméně bolestivý reuse.

**Varianta B:** DCL (Access Control) nad CDS view  
Dává smysl jen pokud máš (nebo chceš mít) persistovanou mapu `user ↔ OU` v tabulce a CDS view přes ni dokáže provést `exists` filtr. To je větší zásah do datového modelu.

### 9.3 Co upravit ve FE aplikaci (kde to “dopsat”)
Správně v `webapp/ext/controller/ListReport.controller.js` – to je controller extension LR.

Napojení má 2 části:
1) **Naplnit ComboBox daty (value help entita)**
2) **Přenést vybranou OU do FE filtru `ORGUNIT` + nastavit `SCOPEMODE` a spustit “Go” (rebind/search)**

#### 9.3.1 Binding ComboBox na OData V4 value help
V XML fragmentu doporučuji udělat binding přímo, ať to nemusíne plnit “ručně” v JS:

```xml
<ComboBox
  id="dznpCbOrgUnit"
  enabled="false"
  placeholder="Organizační jednotka..."
  items="{
    path: '/OrgUnitVH'
  }">
  <core:Item key="{Orgeh}" text="{Orgtx}" />
</ComboBox>
```

**Pozor na flexEnabled:**  
Nepoužívejte v template `<ListItem id=\"\" …>` – UI5 Language Assistant pak hlásí, že ListItem má prázdné ID. U ComboBox používej `core:Item` bez `id`.

> Pokud je tvoje entita pojmenovaná jinak (ne `/OrgUnitVH`), uprav `path` podle `$metadata`.

#### 9.3.2 Přenos vybrané OU do standardních FE filtrů (SCOPEMODE/ORGUNIT)
Backend query provider `ZCL_DZNP_MGR_WL_QP` čte filtry pod názvy:
- `SCOPEMODE`
- `ORGUNIT`

Takže ve FE stačí nastavit tyhle dvě “conditions” do mdc FilterBar a vyvolat search.

Doplň do `ListReport.controller.js`:

```js
sap.ui.define([
  "sap/ui/core/mvc/ControllerExtension",
  "sap/ui/core/Fragment",
  "sap/m/VBox",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator"
], function (ControllerExtension, Fragment, VBox, Filter, FilterOperator) {
  "use strict";

  return ControllerExtension.extend("dznp.ext.controller.ListReport", {
    // ...

    onOrgUnitChanged: function (oEvent) {
      const oCB = oEvent.getSource();
      const sKey = oCB.getSelectedKey();

      // když user vybere OU, nastav scope = ORGEH
      this._applyFEFilter("SCOPEMODE", "ORGEH");
      this._applyFEFilter("ORGUNIT", sKey);

      // spust search (FE "Go")
      this._triggerFESearch();
    },

    _applyFEFilter: function (sField, vValue) {
      // Najdi FE mdc FilterBar (v LR bývá právě jedna)
      const oView = this.base.getView();
      const aFB = oView.findAggregatedObjects(true, o => o && o.isA && o.isA("sap.ui.mdc.FilterBar"));
      const oFB = aFB && aFB[0];
      if (!oFB) {
        console.warn("DZNP: FilterBar not found");
        return;
      }

      // OData V4 / MDC používá "conditions" strukturu
      const mConditions = oFB.getFilterConditions() || {};
      if (vValue) {
        mConditions[sField] = [{ operator: "EQ", values: [vValue] }];
      } else {
        delete mConditions[sField];
      }
      oFB.setFilterConditions(mConditions);
    },

    _triggerFESearch: function () {
      const oView = this.base.getView();
      const aFB = oView.findAggregatedObjects(true, o => o && o.isA && o.isA("sap.ui.mdc.FilterBar"));
      const oFB = aFB && aFB[0];
      if (oFB && oFB.triggerSearch) {
        oFB.triggerSearch();
      } else {
        // fallback přes extensionAPI – záleží na verzi FE
        const oExtAPI = this.base.getExtensionAPI && this.base.getExtensionAPI();
        if (oExtAPI && oExtAPI.refresh) {
          oExtAPI.refresh();
        }
      }
    }
  });
});
```

A ve fragmentu navěs event:

```xml
<ComboBox
  id="dznpCbOrgUnit"
  enabled="false"
  placeholder="Organizační jednotka..."
  change="onOrgUnitChanged"
  items="{ path: '/OrgUnitVH' }">
  <core:Item key="{Orgeh}" text="{Orgtx}" />
</ComboBox>
```

> Tip: Když přepneš radio na “Vedoucí”, nastav `SCOPEMODE = MGR` a vymaž `ORGUNIT`.

### 9.4 Proč je v BAS často DEFAULT_USER
- `sap.ushell.Container.getService("UserInfo")` vrací FLP usera jen když běžíš **v FLP runtime**.
- V lokálním “no-FLP” nebo mock režimu (`fiori run` + mockserver) často žádný FLP user není → mock vrací `DEFAULT_USER`.  
- V reálném systému je rozhodující **serverová session** → `sy-uname` (OData request) bude reálný uživatel, a tím pádem se omezení OU začne chovat správně.

### 9.5 Stav po kroku “value help” a další krok
**Úspěch:** Value help pro OU v našem vlastním bloku funguje a seznam se zobrazuje.  
**Další krok:** Omezit value help podle schvalovatele (server-side) a propojit vybranou OU do FE filterů (`SCOPEMODE/ORGUNIT`) tak, aby to filtr opravdu použil při načtení tabulky.
### 9.4 Stav po úpravě (úspěch: omezené OU + texty se zobrazují)
- Value help v ComboBoxu **vrací pouze organizační jednotky, které má aktuální schvalovatel vidět** (omezení dle backend logiky).   
- Texty/názvy OU se v UI zobrazují správně (kombinace `text` + `additionalText`).   
- Pozn.: v lokálním běhu mimo FLP je `DEFAULT_USER` očekávaný stav – reálný uživatel se dotáhne až ve FLP kontextu.

### 9.5 Další krok: proč filtr na tabulku pořád “nefiltruje” a jak to opravit
Pokud po výběru OU v našem ComboBoxu vidíš v tabulce pořád stejná data, téměř vždy je problém v tom, že **do FE FilterBaru nastavuješ špatné jméno pole**.

V našem případě je to typicky:
- V `$metadata` hlavní entity (worklist) se pole jmenuje **`OrgUnit`**  
- Ale v JS se často omylem nastavuje **`OrganizationalUnit`** (label ze UI), což FilterBar ignoruje → do backendu nejde žádný `$filter`.

#### 9.5.1 Ověření (rychlá kontrola)
1) Otevři `$metadata` a najdi property na worklist entitě: hledej `OrgUnit`.  
2) V Network tabu v prohlížeči zkontroluj request na worklist: musí obsahovat `$filter=OrgUnit eq '10001665'` (nebo ekvivalent v OData V4 syntax).

#### 9.5.2 Oprava v `ListReport.controller.js` (změna názvu filtru)
Najdi metodu, která nastavuje FE filtr pro OU (u tebe např. `_setFEFilter_OrganizationalUnit`) a oprav ji tak, aby nastavovala **`OrgUnit`**:

```js
_setFEFilter_OrgUnit: function (sOrgUnitKey) {
  const oFB = this._getMdcFilterBar();
  if (!oFB) return;

  const m = oFB.getFilterConditions() || {};
  if (sOrgUnitKey) {
    m["OrgUnit"] = [{ operator: "EQ", values: [sOrgUnitKey] }];
  } else {
    delete m["OrgUnit"];
  }
  oFB.setFilterConditions(m);
}
```

A v handleru ComboBoxu volej tuhle metodu (plus scope):

```js
onOrgUnitChanged: function (oEvent) {
  const sKey = oEvent.getSource().getSelectedKey();

  // když uživatel vybere OU, přepni scope na "ORG"
  this._setFEFilter_ScopeMode("ORG");     // název hodnoty uprav podle backendu (např. ORG/ORGEH)
  this._setFEFilter_OrgUnit(sKey);

  this._triggerFESearch();               // ekvivalent FE tlačítka "Go"
}
```

> Pozn.: Pokud backend očekává hodnotu `SCOPEMODE = 'ORGEH'` (nebo jiný kód), použij přesně tu hodnotu.

#### 9.5.3 Kde se berou názvy `OrgUnit`/`SCOPEMODE`
- **Název pole do FE filter conditions musí odpovídat property v `$metadata` hlavní entity** (worklistu), ne labelu.  
- Backend (query provider / select) pak tyhle filtry čte z `io_request->get_filter( )` / `get_filter_conditions( )` podle property name.

### 9.6 Zápis stavu do plánu
- **9.x – Úspěch:** Value help pro organizační jednotky běží, je omezený dle schvalovatele a texty se zobrazují. ✅  
- **Další práce:** napojit výběr OU na FE FilterBar přes správnou property (`OrgUnit`) a ověřit v Network, že se posílá `$filter` do backendu. ➜ pokračujeme na další část funkcionality.