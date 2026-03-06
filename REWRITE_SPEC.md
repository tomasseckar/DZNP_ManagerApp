# DZNP Manager App – Kompletní zadání pro přepis aplikace

## 1) Cíl
Vytvořit znovu celou SAP Fiori aplikaci (FE V4 List Report) se stejnou funkcionalitou a chováním, jaké má stávající `DZNP_ManagerApp`. Nová implementace musí zachovat stejné obrazovky, navigaci, datové zdroje a business logiku, včetně všech custom úprav v controlleru a fragmentu.

## 2) Technologický rámec
- **UI5 / SAP Fiori Elements V4**
- **List Report** + **Object Page** (na stejném OData V4 service)
- UI5 verze: **1.120.14** (minimálně)
- Motiv: **sap_horizon**
- Komponenta: `dznp` (AppComponent)
- Bez TypeScriptu

## 3) Datové zdroje a služba
- OData V4 service:
  - `http://df5.ext.cssz.cz:8005/sap/opu/odata4/sap/zui_dznp_o4_ui/srvd/sap/zui_dznp_o4/0001/`
- Annotation soubor: `webapp/annotations/annotation.xml`
- Hlavní entity set:
  - **ManagerWorklist**
- Lokální metadata (pro mock): `webapp/localService/mainService/metadata.xml`

## 4) Datový model (klíčová pole)
Entita `ManagerWorklist` / `ManagerWorklistType` obsahuje minimálně:
- `PersonalNumber`
- `EmployeeName`
- `BenefitSubtype`
- `BenefitSubtypeText`
- `ValidFromDate`
- `ValidToDate`
- `SequenceNumber`
- `SubmissionStatus`
- `SubmissionStatusText`
- `ScopeMode`
- `OrgUnit`

## 5) Obrazovky
### 5.1 List Report – `ManagerWorklistList`
- UI5 FE template: `sap.fe.templates.ListReport`
- Kontext: `/ManagerWorklist`
- Tabulka: **ResponsiveTable**
- Default variant: `SelectionPresentationVariant#tableView`
- Zobrazení sloupců dle `UI.LineItem`:
  - Os. číslo (`PersonalNumber`)
  - Jméno (`EmployeeName`)
  - Typ podání (`BenefitSubtypeText`)
  - Stav (`SubmissionStatus`)
  - Stav (text) (`SubmissionStatusText`)
- Inline akce z annotations:
  - `approveByManager`
  - `rejectByManager`

### 5.2 Object Page – `ManagerWorklistObjectPage`
- UI5 FE template: `sap.fe.templates.ObjectPage`
- Kontext: `/ManagerWorklist`
- `editableHeaderContent = false`

## 6) Custom filtr panel (zásadní custom funkce)
Aplikace **vkládá vlastní panel s kritérii nad tabulku** List Reportu.

### 6.1 Fragment
Vložení fragmentu `webapp/ext/fragment/CustomFilterBar.fragment.xml` obsahuje:
- **Rok** (input + šipky nahoru/dolů)
- **Schvalovatel** (read-only, plní se z FLP user info)
- **Sestava za** – přepínač:
  - Vedoucí (MGR)
  - Organizační jednotka (ORGEH)
- **Organizační jednotka** – ComboBox napojený na `/OrgUnitVHUser`
- Testovací tlačítko pro navigaci do podání

### 6.2 Logika filtrů
- Po změně hodnot v panelu se **synchronizují FE filtry** a **spouští search**.
- ScopeMode:
  - `MGR` když je vybrán „Vedoucí“
  - `ORGEH` když je vybrána „Organizační jednotka“
- OrgUnit filtr se posílá jen v režimu `ORGEH`
- ValidFromDate se filtruje **between** (01.01. až 31.12. zvoleného roku)

### 6.3 Plnění schvalovatele
- Z FLP UserInfo:
  - `UserInfo.getUser().getId()`
  - `UserInfo.getUser().getFullName()`
- Výsledek se zapisuje do `dznpInpApprover` a `dznpTxtApproverName`

### 6.4 Fallback filtrace
Pokud FE FilterBar API není dostupný:
- Použít přímé `binding.filter()` na tabulce (sap.m.Table / sap.ui.mdc.Table / sap.ui.table.Table)

## 7) Navigace do podací aplikace (DZNP podání)
### 7.1 Outbound
- `semanticObject = DZNP`
- `action = podani`
- Outbound ID v `manifest.json`: `toPodani`

### 7.2 Deep link (appSpecificRoute)
- Pro každý `BenefitSubtype` vybrat stránku:
  - DLO → `FormDLO`
  - OSE → `FormOSE`
  - OPP → `FormOPP`
  - PPM → `FormPPM`
  - fallback: `Form${BenefitSubtype}`

Route tvar:
```
FormXXX(
  PersonalNumber='...'
  ,BenefitSubtype='...'
  ,ValidFromDate=...
  ,ValidToDate=...
  ,SequenceNumber='...'
)/
```

### 7.3 Parametry navigace
- Parametry jdou do **`params`** (nikoliv do `appSpecificRoute` query)
- Vždy posílat jako **pole** hodnot
- Povinné parametry:
  - `sap-ui-fl-disable = true`
  - `sap-ui-xx-flex = disable`
  - `mode = view` nebo `mode = edit` (dle kontextu)

### 7.4 Navigační služby
1. Preferovaná: `sap.ushell.Container.getServiceAsync("CrossApplicationNavigation")`
2. Fallback: `extensionAPI.intentBasedNavigation.navigateOutbound("toPodani", params, appSpecificRoute)`

### 7.5 Row press nav
- Napojení row/chevron press na navigaci
- Fallbacky: `rowPress`, `itemPress`, `rowSelectionChange`
- Pokud není k dispozici context, zkusit:
  - last row context
  - selected row
  - first row context (async)

## 8) i18n
- `i18n/i18n.properties`
- `i18n/i18n_en.properties`

## 9) UX a chování
- List Report je default vstupní obrazovka
- Po zobrazení se automaticky
  - injektuje custom panel nad tabulku
  - provede default filtering (`MGR` + rok)
  - spustí search/rebind

## 10) Testy
- QUnit + OPA konfigurace existuje
- Zachovat existující test structure:
  - `test/integration/*`
  - `testsuite.qunit.js`

## 11) Výstupy
Robot musí dodat:
- Kompletní UI5 FE app (List Report + Object Page)
- Custom controller extension (`ListReport.controller.js`)
- Custom fragment (`CustomFilterBar.fragment.xml`)
- Zachovaný model, routing a crossNavigation
- Všechny funkce uvedené v tomto zadání

## 12) Akceptační kritéria
- Aplikace startuje na List Reportu, data se načítají z OData v4.
- Custom panel je vložen nad tabulku a je funkční.
- Filtry jsou propsané do FE FilterBar a search je spuštěn.
- Navigace do `DZNP-podani` funguje, hash obsahuje `sap-ui-fl-disable=true` a `sap-ui-xx-flex=disable`.
- Inline akce approve/reject jsou dostupné.
- Object Page se otevírá pro detail `ManagerWorklist`.

---

> Tento dokument je určen jako **kompletní zadání** pro automatického asistenta (robota), který má aplikaci přepsat od nuly se zachováním všech funkcí.
