sap.ui.define([
  "sap/ui/core/mvc/ControllerExtension",
  "sap/ui/core/Fragment",
  "sap/m/VBox"
], function (ControllerExtension, Fragment, VBox) {
  "use strict";

  return ControllerExtension.extend("dznp.ext.controller.ListReport", {
    override: {
      onAfterRendering: function () {
        // 1) vlož fragment nad tabulku (wrap content)
        this._injectCriteriaAboveTable();
      }
    },

    // =========================================================
    // Event z fragmentu
    // =========================================================
    onScopeChanged: function (oEvent) {
      const iIdx = oEvent.getSource().getSelectedIndex(); // 0 = Vedoucí, 1 = Org
      const bOrg = iIdx === 1;

      const oCB = this._byFragId("dznpCbOrgUnit");
      if (oCB) {
        oCB.setEnabled(bOrg);
        if (!bOrg) {
          // volitelně při přepnutí zpět na Vedoucí vyčisti OU
          if (oCB.setSelectedKey) {
            oCB.setSelectedKey("");
          }
          if (oCB.setValue) {
            oCB.setValue("");
          }
        }
      }
    },

    // =========================================================
    // Helper: najdi control ve fragmentu bezpečně
    // =========================================================
    _byFragId: function (sLocalId) {
      if (!this._sFragId) {
        return null;
      }
      return Fragment.byId(this._sFragId, sLocalId);
    },

    // =========================================================
    // Naplnění Approver polí z FLP UserInfo
    // =========================================================
    _fillApproverFromShell: function () {
      // Fragment ještě nemusí být hotový => retry
      const oInpApprover = this._byFragId("dznpInpApprover");
      const oTxtName = this._byFragId("dznpTxtApproverName");

      if (!oInpApprover || !oTxtName) {
        setTimeout(this._fillApproverFromShell.bind(this), 200);
        return;
      }

      let sId = "";
      let sFullName = "";

      try {
        const oUser = sap.ushell
          && sap.ushell.Container
          && sap.ushell.Container.getService
          && sap.ushell.Container.getService("UserInfo")
          && sap.ushell.Container.getService("UserInfo").getUser
          && sap.ushell.Container.getService("UserInfo").getUser();

        if (oUser) {
          sId = (oUser.getId && oUser.getId()) || "";
          sFullName = (oUser.getFullName && oUser.getFullName()) || "";
        }
      } catch (e) {
        console.warn("DZNP: UserInfo service not available (not running in FLP?)", e);
      }

      // fallback: když není full name, dej aspoň ID
      if (!sFullName) {
        sFullName = sId;
      }

      oInpApprover.setValue(sId);
      oTxtName.setText(sFullName);

      console.log("DZNP: Approver filled:", sId, sFullName);
    },

    // =========================================================
    // Hlavní injekt (VBox wrap)
    // =========================================================
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

        // 3) Načti fragment jen jednou + DŮLEŽITÉ: dej mu ID prefix
        if (!this._oCriteriaFrag) {
          // prefix = stabilní, unikátní pro daný FE view
          this._sFragId = oView.createId("dznpCriteria");

          this._oCriteriaFrag = await Fragment.load({
            id: this._sFragId,                    // <<< KLÍČOVÉ (prefix pro všechna ID v fragmentu)
            name: "dznp.ext.fragment.CustomFilterBar",
            controller: this
          });
        }

        // 4) DynamicPage.content je 0..1 → zabal do VBox
        if (oParent.isA && oParent.isA("sap.f.DynamicPage")) {
          const sAggr = "content";
          const oOldContent = oParent.getAggregation(sAggr); // 0..1

          // Pokud už je jednou zabalené, skonči
          if (
            oOldContent
            && oOldContent.isA
            && oOldContent.isA("sap.m.VBox")
            && oOldContent.data("dznpWrapped") === true
          ) {
            console.log("DZNP: DynamicPage.content already wrapped");
            this._bInjected = true;
            return;
          }

          const oBox = new VBox({ width: "100%" });
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

          // 5) Teď už můžeme bezpečně plnit approvera (fragment existuje)
          this._fillApproverFromShell();

          return;
        }

        console.warn("DZNP: Parent is not sap.f.DynamicPage – runtime struktura se změnila.");
      } catch (e) {
        console.error("DZNP: _injectCriteriaAboveTable FAILED", e);
      }
    }
  });
});
