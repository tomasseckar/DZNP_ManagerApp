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
- [9) (ÚSPĚCH ✅) Value help pro organizační jednotky omezený podle schvalovatele + reálné filtrování tabulky](#9-úspěch--value-help-pro-organizační-jednotky-omezený-podle-schvalovatele--reálné-filtrování-tabulky)

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


## 9) (ÚSPĚCH ✅) Value help pro organizační jednotky omezený podle schvalovatele + reálné filtrování tabulky

V této části jsme dotáhli dvě věci najednou:

1) **Value help „Organizační jednotka“** se v UI nabízí jen pro OU, které jsou relevantní pro aktuálního schvalovatele (uživatele).  
2) Výběr OU (a volba „Sestava za“) se **opravdu promítne do dotazu na `ManagerWorklist`** – tzn. dojde k `?$filter=...` a tabulka se přefiltruje.

> Pozn.: Protože používáme vlastní (nestandardní) blok kritérií, musíme výsledné hodnoty **synchronizovat do standardního FE FilterBaru** (nebo v krajním případě přímo nastavit filtry na binding tabulky).

---

### 9.1 Backend – návrh a logika: custom entity `ZI_DZNP_OrgUnitVH_User` + Query Provider `ZCL_DZNP_ORGUNIT_VH_QP`

**Cíl backendu:** vracet pro value help jen ty OU, které má aktuální uživatel „dovoleno“ použít (typicky podle toho, kdo je schvalovatel / vedoucí).

#### 9.1.1 Co je potřeba v CDS
- **Custom entity** pro value help (např. `ZI_DZNP_OrgUnitVH_User`)
- **Query provider class** (`ZCL_DZNP_ORGUNIT_VH_QP`) implementující `IF_RAP_QUERY_PROVIDER`
- OData service musí VH **exponovat** (u tebe je to už hotové):
  - `expose ZC_DZNP_OrgUnitVH ... as OrgUnitVH;`

> Princip: UI5 ComboBox/ValueHelp zavolá OData kolekci `OrgUnitVH` a backend v QP vrátí „povolené“ OU.

#### 9.1.2 Vnitřní logika QP (co dělá `select`)
V `IF_RAP_QUERY_PROVIDER~SELECT` typicky:
1) zjistí uživatele (standardně `sy-uname`)
2) načte OU podle interní HR logiky (už existuje u vás v backendu – „už jsem to kdysi řešil“)
3) aplikuje `$search` (value help to používá při psaní do pole)
4) aplikuje paging (`$skip/$top`)
5) pošle data do `io_response->set_data( ... )`

**Klíčové:** nesnažíme se v FE dělat autorizace OU – pouze posíláme „bezpečný“ seznam z backendu.

---

### 9.2 Frontend – fragment: ComboBox napojený na VH a správné zobrazení textu

V `CustomFilterBar.fragment.xml` máme pole:

- `dznpCbOrgUnit` = ComboBox
- musí:
  - **dělat binding na kolekci VH** (např. `/OrgUnitVH`)
  - mít `showSecondaryValues="true"` (aby byl vidět kód + text)
  - mít `items` šablonu (`core:ListItem`) a **každý ListItem musí mít `id`** (kvůli `flexEnabled=true`)
  - mít `change="onOrgUnitChanged"` / `selectionChange="..."` (aby se změna propisovala do filtrování)

Typický tvar (ukázka):

```xml
<ComboBox
  id="dznpCbOrgUnit"
  enabled="false"
  placeholder="Organizační jednotka..."
  showSecondaryValues="true"
  items="{
    path: '/OrgUnitVH'
  }"
  selectionChange="onOrgUnitChanged">
  <core:ListItem
    id="dznpLiOrgUnit"
    key="{OrgUnit}"
    text="{OrgUnitText}"
    additionalText="{OrgUnit}" />
</ComboBox>
```

**Poznámky:**
- `key` musí být **technická hodnota**, kterou budeme filtrovat (`OrgUnit`).
- `text` je „hezký“ popisek (`OrgUnitText`).
- `additionalText` je kód OU – při `showSecondaryValues=true` je to „vpravo“.

Tím jsme dosáhli toho, že:
- backend vrací data včetně textu (ověřeno v debuggu),
- FE je umí zobrazit (a už to vidíš v rozbalováku správně).

---

### 9.3 ScopeMode – „Sestava za vedoucího“ vs „Sestava za organizační jednotku“

V UI máme přepínač `RadioButtonGroup`:

- index `0` = **Vedoucí**
- index `1` = **Organizační jednotka**

V backendu se to mapuje na hodnoty (dle vašich testovacích requestů):
- `ScopeMode = 'MGR'` (vedoucí)  
- `ScopeMode = 'ORGEH'` (organizační jednotka)

> Ověřeno: ruční request  
> `.../ManagerWorklist?$filter=ScopeMode eq 'ORGEH' and OrgUnit eq '10001665' ...`  
> vrací očekávaný výsledek.

---

### 9.4 FE – synchronizace vlastních kritérií do standardního FE FilterBaru + spuštění vyhledání

#### 9.4.1 Proč to musíme dělat takhle
ListReport tabulka ve Fiori Elements je navázaná na **standardní FilterBar / MDC** a FE generuje request na `ManagerWorklist` podle **FilterBar conditions**.

Když máme vlastní pole mimo standardní FE filter, FE o nich „neví“, takže:
- request na `ManagerWorklist` neobsahuje `$filter`
- tabulka se nepřefiltruje

Řešení:
- při změně hodnoty v našem fragmentu přeneseme hodnotu do **FE FilterBar** a vyvoláme „Go/Search“.

#### 9.4.2 Jak to děláme – kroky v controlleru
V `ListReport.controller.js` jsme doplnili:

1) **Handler změny OU** (a/nebo ScopeMode):
   - `onOrgUnitChanged(oEvent)` + volitelně v `onScopeChanged` také trigger
2) **Nalezení FE FilterBaru** v runtime stromu:
   - vyhledání controlu typu `sap.ui.mdc.FilterBar`
3) **Sestavení conditions objektu** ve formátu MDC:
   - pro rovnost (`EQ`) vypadá typicky:
     ```js
     {
       operator: "EQ",
       values: ["10001665"],
       validated: "Validated"
     }
     ```
4) **Zapsání do FilterBaru:**
   - `oFilterBar.setFilterConditions({ OrgUnit: [ ... ], ScopeMode: [ ... ] })`
5) **Spuštění search/rebind**
   - ideálně přes FE API (pokud je dostupné), jinak přes metodu FilterBaru

V logu pak vidíš:
- `OrgUnit selected -> synced to FE FilterBar conditions ...`
- `Search/rebind triggered: true`

A hlavně v Network/trace se objeví dotaz s `$filter`.

#### 9.4.3 Důležité: eventy z XML musí opravdu pálit
Aby se filtrovalo i při změně OU, **musí být event v XML** (u tebe už je).

Pro ComboBox doporučuju:
- `selectionChange="onOrgUnitChanged"` (nejjistější při výběru z listu)
- případně i `change="onOrgUnitChanged"` (když uživatel píše a potvrzuje)

---

### 9.5 Troubleshooting, které jsme cestou řešili

#### 9.5.1 „DEFAULT_USER“ v BAS (bez FLP)
Když aplikaci pouštíš mimo FLP (typicky lokálně v BAS preview), služba `sap.ushell.Container.getService("UserInfo")` vrací „default“ user (`DEFAULT_USER`).

- To je očekávané chování – FLP kontejnér není dostupný.
- Ve skutečném FLP běhu se vrátí reálné `sy-uname` uživatele.

Proto jsme:
- implementovali logiku pro naplnění „Schvalovatel“ přes `UserInfo` (když existuje)
- a je OK, že v BAS je default.

#### 9.5.2 Dvojí ValueList anotace a hláška `getCaseSensitive`
V konzoli se objevovalo:

- `ValueList with identical qualifier '' ...`
- `Cannot read properties of undefined (reading 'getCaseSensitive')`

To typicky znamená:
- FE dostává **2× ValueList anotaci** pro stejnou property (`/ManagerWorklist/OrgUnit`)
  - jednou z `$metadata` hlavní služby
  - podruhé z `$metadata` value help služby (nebo z jiné reference)

Doporučení:
- mít **jen jednu** „primary“ ValueList anotaci pro property `OrgUnit` v hlavním metadatu,
- nebo používat kvalifikátory (qualifier) a jasně řídit, která ValueList je „aktivní“,
- případně odstranit duplicitu v service composition.

Pozn.: I s touto hláškou to může fungovat, ale je to technický dluh – při upgradu UI5 se to může zhoršit.

---

### 9.6 Aktuální stav (potvrzeno) + jak ověřit, že filtr opravdu jde do requestu

✅ **Stav teď:**
- V rozbalováku OU vidíš **jen OU relevantní pro uživatele** (backend omezení funguje).
- OU se zobrazuje jako `Text + kód` (ComboBox správně binduje na `OrgUnitText`).
- Výběr OU a přepínač ScopeMode **reálně filtruje tabulku**.

#### 9.6.1 Jak to ověřit (prakticky)
1) Otevři DevTools → Network
2) Změň „Sestava za“ na **Organizační jednotku**
3) Vyber OU z ComboBoxu
4) Sledu request na:
   - `.../ManagerWorklist?...`
5) Musíš vidět `$filter` ve tvaru:
   - `ScopeMode eq 'ORGEH' and OrgUnit eq '10001665'`
6) V odpovědi musí být odpovídající záznamy (a po změně OU se musí měnit)

---

### 9.7 Co je další (navazující funkcionalita)
Tímhle jsme uzavřeli část „vlastní výběrová kritéria + value help + filtrování“.

Další logická část projektu (navazuje na původní plán):
- řešit zbytek workflow / schvalování (approve/reject) a související logiku,
- dotáhnout texty v `ManagerWorklist` (např. `OrgUnitText`, `SubmissionStatusText`), pokud má být i v listu,
- uklidit/skrýt původní standardní filtry (pokud je už nechceme v UI vůbec).