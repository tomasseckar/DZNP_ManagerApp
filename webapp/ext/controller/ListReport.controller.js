sap.ui.define([
  "sap/ui/core/mvc/ControllerExtension",
  "sap/ui/core/Fragment",
  "sap/m/VBox",
  "sap/ui/mdc/condition/Condition"
], function (ControllerExtension, Fragment, VBox, Condition) {
  "use strict";

  return ControllerExtension.extend("dznp.ext.controller.ListReport", {
    override: {
      onAfterRendering: function () {
        this._injectCriteriaAboveTable();
      }
    },

    // =========================================================
    // Event z fragmentu: scope
    // =========================================================
    onScopeChanged: function (oEvent) {
      const iIdx = oEvent.getSource().getSelectedIndex(); // 0 = Vedoucí, 1 = Org
      const bOrg = iIdx === 1;

      const oCB = this._byFragId("dznpCbOrgUnit");
      if (oCB) {
        oCB.setEnabled(bOrg);

        // při přepnutí zpět na Vedoucí vyčisti OU + FE filtr
        if (!bOrg) {
          if (oCB.setSelectedKey) oCB.setSelectedKey("");
          if (oCB.setValue) oCB.setValue("");

          this._setFEFilter_OrganizationalUnit("");
        }
      }
    },

    // =========================================================
    // Event z fragmentu: org unit changed
    // =========================================================
    onOrgUnitChanged: function (oEvent) {
      const oCB = oEvent.getSource();
      const sKey = (oCB.getSelectedKey && oCB.getSelectedKey()) || "";

      // 1) nastav do FE FilterBar condition modelu
      this._setFEFilter_OrganizationalUnit(sKey);

      // 2) volitelně rovnou “Go”
      //    (pokud nechceš auto-search, tenhle blok smaž)
      const oFB = this._getFEFilterBar();
      if (oFB && oFB.triggerSearch) {
        oFB.triggerSearch();
      }
    },

    // =========================================================
    // Helper: najdi control ve fragmentu bezpečně
    // =========================================================
    _byFragId: function (sLocalId) {
      if (!this._sFragId) return null;
      return Fragment.byId(this._sFragId, sLocalId);
    },

    // =========================================================
    // Helper: FE FilterBar přes ExtensionAPI (nejstabilnější cesta)
    // =========================================================
    _getFEFilterBar: function () {
      const oExt = this.base && this.base.getExtensionAPI && this.base.getExtensionAPI();
      if (!oExt || !oExt.getFilterBar) return null;
      return oExt.getFilterBar(); // sap.ui.mdc.FilterBar (většinou)
    },

    // =========================================================
    // Nastav FE filtr pro OrganizationalUnit (musí sedět na property v entity)
    // =========================================================
    _setFEFilter_OrganizationalUnit: function (sOrgUnitKey) {
      const oFB = this._getFEFilterBar();
      if (!oFB) {
        console.warn("DZNP: FE FilterBar not available (yet).");
        return;
      }

      // Název pole musí odpovídat property ve FE (v entitě ListReportu)
      // Z UI screenshotu to vypadá na "OrganizationalUnit"
      const sProp = "OrganizationalUnit";

      // FE pracuje s "conditions"
      // - prázdné => vymazat
      // - jinak EQ
      const mConds = oFB.getFilterConditions ? oFB.getFilterConditions() : {};
      if (!sOrgUnitKey) {
        mConds[sProp] = [];
      } else {
        mConds[sProp] = [Condition.createCondition("EQ", [sOrgUnitKey], null, null)];
      }

      if (oFB.setFilterConditions) {
        oFB.setFilterConditions(mConds);
      } else {
        console.warn("DZNP: FilterBar has no setFilterConditions(). UI5/FE verze se liší.");
      }

      console.log("DZNP: FE filter set", sProp, sOrgUnitKey);
    },

    // =========================================================
    // Naplnění Approver polí z FLP UserInfo
    // =========================================================
    _fillApproverFromShell: function () {
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

      if (!sFullName) sFullName = sId;

      oInpApprover.setValue(sId);
      oTxtName.setText(sFullName);

      console.log("DZNP: Approver filled:", sId, sFullName);
    },

    // =========================================================
    // Hlavní injekt (VBox wrap)
    // =========================================================
    _injectCriteriaAboveTable: async function () {
      try {
        if (this._bInjected) return;

        const oView = this.base.getView();

        const aTableApi = oView.findAggregatedObjects(true, function (o) {
          return o && o.isA && o.isA("sap.fe.macros.table.TableAPI");
        });

        const oTableApi = aTableApi && aTableApi[0];
        if (!oTableApi) {
          console.warn("DZNP: TableAPI not found yet, retry...");
          setTimeout(this._injectCriteriaAboveTable.bind(this), 300);
          return;
        }

        const oParent = oTableApi.getParent();
        if (!oParent) {
          console.warn("DZNP: TableAPI parent not found");
          return;
        }

        console.log(
          "DZNP: TableAPI parent =", oParent.getMetadata().getName(),
          "parentAggr =", oTableApi.sParentAggregationName
        );

        if (!this._oCriteriaFrag) {
          this._sFragId = oView.createId("dznpCriteria");

          this._oCriteriaFrag = await Fragment.load({
            id: this._sFragId,
            name: "dznp.ext.fragment.CustomFilterBar",
            controller: this
          });
        }

        if (oParent.isA && oParent.isA("sap.f.DynamicPage")) {
          const sAggr = "content";
          const oOldContent = oParent.getAggregation(sAggr);

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

          oBox.addItem(this._oCriteriaFrag);

          if (oOldContent) {
            oParent.setAggregation(sAggr, null);
            oBox.addItem(oOldContent);
          }

          oParent.setAggregation(sAggr, oBox);

          this._bInjected = true;
          console.log("DZNP: Wrapped DynamicPage.content with VBox and inserted criteria ✅");

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
