sap.ui.define([
  "sap/ui/core/mvc/ControllerExtension",
  "sap/ui/core/Fragment",
  "sap/m/VBox",
  "sap/base/Log",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator"
], function (ControllerExtension, Fragment, VBox, Log, Filter, FilterOperator) {
  "use strict";

  return ControllerExtension.extend("dznp.ext.controller.ListReport", {
    override: {
      onAfterRendering: function () {
        this._injectCriteriaAboveTable();
      }
    },

    // =========================================================
    // Eventy z fragmentu
    // =========================================================
    onScopeChanged: function (oEvent) {
      const iIdx = oEvent.getSource().getSelectedIndex(); // 0 = Vedoucí, 1 = Org
      const bOrg = iIdx === 1;

      const oCB = this._byFragId("dznpCbOrgUnit");
      if (oCB) {
        oCB.setEnabled(bOrg);

        // při přepnutí zpět na Vedoucí vyčisti OU
        if (!bOrg) {
          if (oCB.setSelectedKey) {
            oCB.setSelectedKey("");
          }
          if (oCB.setValue) {
            oCB.setValue("");
          }
        }
      }

      // po změně režimu vždy synchronizuj do FE FilterBar + search
      this._syncFeFiltersAndSearch();
    },

    onOrgUnitChanged: function () {
      // OrgUnit změněna => sync + search
      this._syncFeFiltersAndSearch();
    },

    // =========================================================
    // Helper: najdi control ve fragmentu bezpečně (přes prefix)
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
      const oInpApprover = this._byFragId("dznpInpApprover");
      const oTxtName = this._byFragId("dznpTxtApproverName");

      if (!oInpApprover || !oTxtName) {
        setTimeout(this._fillApproverFromShell.bind(this), 200);
        return;
      }

      let sId = "";
      let sFullName = "";

      try {
        const oUser =
          sap.ushell &&
          sap.ushell.Container &&
          sap.ushell.Container.getService &&
          sap.ushell.Container.getService("UserInfo") &&
          sap.ushell.Container.getService("UserInfo").getUser &&
          sap.ushell.Container.getService("UserInfo").getUser();

        if (oUser) {
          sId = (oUser.getId && oUser.getId()) || "";
          sFullName = (oUser.getFullName && oUser.getFullName()) || "";
        }
      } catch (e) {
        Log.warning("DZNP: UserInfo service not available (not running in FLP?)", e);
      }

      if (!sFullName) {
        sFullName = sId;
      }

      oInpApprover.setValue(sId);
      oTxtName.setText(sFullName);

      Log.info("DZNP: Approver filled: " + sId + " " + sFullName);
    },

    // =========================================================
    // Vytáhni hodnoty z vlastních kritérií
    // =========================================================
    _getCriteriaValues: function () {
      // ScopeMode: 0=Vedoucí => "MGR", 1=Org jednotka => "ORGEH"
      const oRb = this._byFragId("dznpRbScope");
      const iIdx = oRb ? oRb.getSelectedIndex() : 0;
      const sScopeValue = (iIdx === 1) ? "ORGEH" : "MGR";

      const oCB = this._byFragId("dznpCbOrgUnit");
      const sOrgKey = oCB && oCB.getSelectedKey ? (oCB.getSelectedKey() || "") : "";

      return {
        scopeMode: sScopeValue,
        orgUnit: sOrgKey
      };
    },

    // =========================================================
    // Najdi standardní FE FilterBar (sap.ui.mdc.FilterBar)
    // =========================================================
    _getFeFilterBar: function () {
      const oView = this.base.getView();

      const aFbs = oView.findAggregatedObjects(true, function (o) {
        return o && o.isA && o.isA("sap.ui.mdc.FilterBar");
      });

      return aFbs && aFbs[0];
    },

    // =========================================================
    // Nastav conditions do FE FilterBar + spusť search (=> $filter v requestu)
    // =========================================================
    _syncFeFiltersAndSearch: function () {
      try {
        const oFilterBar = this._getFeFilterBar();
        const v = this._getCriteriaValues();

        // pokud FilterBar ještě není ready, zkus později
        if (!oFilterBar) {
          Log.warning("DZNP: FE FilterBar not ready yet -> retry");
          setTimeout(this._syncFeFiltersAndSearch.bind(this), 250);
          return;
        }

        // Conditions formát (mdc):
        // { PropertyName: [ { operator: "EQ", values: ["..."], validated: "Validated" } ] }
        const oConds = {};

        // ScopeMode vždy
        oConds.ScopeMode = [{
          operator: "EQ",
          values: [v.scopeMode],
          validated: "Validated"
        }];

        // OrgUnit jen když ORGEH a máme klíč
        if (v.scopeMode === "ORGEH" && v.orgUnit) {
          oConds.OrgUnit = [{
            operator: "EQ",
            values: [v.orgUnit],
            validated: "Validated"
          }];
        } else {
          // když nejsme v ORGEH režimu, OrgUnit condition raději smaž
          oConds.OrgUnit = [];
        }

        // Nastav do FE FilterBar (přepíše podmínky pro dané properties)
        if (oFilterBar.setFilterConditions) {
          oFilterBar.setFilterConditions(oConds);
        } else if (oFilterBar.setConditions) {
          // fallback pro jiné minor verze
          oFilterBar.setConditions(oConds);
        } else {
          Log.warning("DZNP: FE FilterBar does not support setFilterConditions/setConditions");
        }

        Log.info("DZNP: OrgUnit selected -> synced to FE FilterBar conditions", oConds);

        // Spusť search => FE udělá rebind tabulky s $filter
        let bTriggered = false;
        if (oFilterBar.triggerSearch) {
          oFilterBar.triggerSearch();
          bTriggered = true;
        } else if (oFilterBar.fireSearch) {
          oFilterBar.fireSearch();
          bTriggered = true;
        }

        Log.info("DZNP: Search/rebind triggered: " + bTriggered);

        // pokud by search nebyl dostupný (nestandard), fallback na přímý binding filtr
        if (!bTriggered) {
          this._applyTableFiltersAndRebind_Fallback();
        }
      } catch (e) {
        Log.error("DZNP: _syncFeFiltersAndSearch FAILED", e);
      }
    },

    // =========================================================
    // Fallback: přímý filtr na binding tabulky (když FilterBar nejde)
    // =========================================================
    _getTableAndBinding: function () {
      const oView = this.base.getView();

      const aTableApi = oView.findAggregatedObjects(true, function (o) {
        return o && o.isA && o.isA("sap.fe.macros.table.TableAPI");
      });
      const oTableApi = aTableApi && aTableApi[0];
      if (!oTableApi) {
        return null;
      }

      const aTables = oTableApi.findAggregatedObjects(true, function (o) {
        return o && o.isA && (
          o.isA("sap.m.Table") ||
          o.isA("sap.ui.mdc.Table") ||
          o.isA("sap.ui.table.Table")
        );
      });

      const oTable = aTables && aTables[0];
      if (!oTable) {
        return null;
      }

      const sAggr = oTable.isA("sap.ui.table.Table") ? "rows" : "items";
      const oBinding = oTable.getBinding(sAggr);

      if (!oBinding) {
        return null;
      }

      return { oTableApi, oTable, oBinding, sAggr };
    },

    _applyTableFiltersAndRebind_Fallback: function () {
      try {
        const oTB = this._getTableAndBinding();
        if (!oTB) {
          Log.warning("DZNP: Table/binding not ready yet -> retry (fallback)");
          setTimeout(this._applyTableFiltersAndRebind_Fallback.bind(this), 250);
          return;
        }

        const v = this._getCriteriaValues();

        const aFilters = [
          new Filter("ScopeMode", FilterOperator.EQ, v.scopeMode)
        ];

        if (v.scopeMode === "ORGEH" && v.orgUnit) {
          aFilters.push(new Filter("OrgUnit", FilterOperator.EQ, v.orgUnit));
        }

        oTB.oBinding.filter(aFilters);
        Log.info("DZNP: Fallback applied table filters (binding.filter).");
      } catch (e) {
        Log.error("DZNP: _applyTableFiltersAndRebind_Fallback FAILED", e);
      }
    },

    // =========================================================
    // Hlavní injekt (VBox wrap)
    // =========================================================
    _injectCriteriaAboveTable: async function () {
      try {
        if (this._bInjected) {
          return;
        }

        const oView = this.base.getView();

        const aTableApi = oView.findAggregatedObjects(true, function (o) {
          return o && o.isA && o.isA("sap.fe.macros.table.TableAPI");
        });

        const oTableApi = aTableApi && aTableApi[0];
        if (!oTableApi) {
          Log.warning("DZNP: TableAPI not found yet, retry...");
          setTimeout(this._injectCriteriaAboveTable.bind(this), 300);
          return;
        }

        const oParent = oTableApi.getParent();
        if (!oParent) {
          Log.warning("DZNP: TableAPI parent not found");
          return;
        }

        Log.info("DZNP: TableAPI parent = " + oParent.getMetadata().getName() +
          " parentAggr = " + oTableApi.sParentAggregationName);

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

          if (oOldContent && oOldContent.isA && oOldContent.isA("sap.m.VBox")
            && oOldContent.data("dznpWrapped") === true) {
            Log.info("DZNP: DynamicPage.content already wrapped");
            this._bInjected = true;

            // po re-renderu znovu sync filtrů
            this._syncFeFiltersAndSearch();
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
          Log.info("DZNP: Wrapped DynamicPage.content with VBox and inserted criteria ✅");

          // Approver
          this._fillApproverFromShell();

          // inicializační sync (výchozí je Vedoucí => MGR)
          this._syncFeFiltersAndSearch();

          return;
        }

        Log.warning("DZNP: Parent is not sap.f.DynamicPage – runtime struktura se změnila.");
      } catch (e) {
        Log.error("DZNP: _injectCriteriaAboveTable FAILED", e);
      }
    }
  });
});
