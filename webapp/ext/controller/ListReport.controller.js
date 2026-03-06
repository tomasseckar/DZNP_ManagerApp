sap.ui.define([
  "sap/ui/core/mvc/ControllerExtension",
  "sap/ui/core/Fragment",
  "sap/m/VBox",
  "sap/base/Log",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/m/MessageToast"
], function (ControllerExtension, Fragment, VBox, Log, Filter, FilterOperator, MessageToast) {
  "use strict";

  return ControllerExtension.extend("dznp.ext.controller.ListReport", {
    override: {
      onAfterRendering: function () {
        this._injectCriteriaAboveTable();
        this._wireTableRowPressNavigation();
      }
    },

    // =========================================================
    // Eventy z fragmentu
    // =========================================================
	onPressBttnYearDown: function () {
		let inputYear = this._byFragId("dznpInpYear").getValue();
		let inputYearInt = parseInt(inputYear);
		this._byFragId("dznpInpYear").setValue(inputYearInt-1);

		this._syncFeFiltersAndSearch();
	},

	onPressBttnYearUp: function () {
		let inputYear = this._byFragId("dznpInpYear").getValue();
		let inputYearInt = parseInt(inputYear);
		this._byFragId("dznpInpYear").setValue(inputYearInt+1);

		this._syncFeFiltersAndSearch();
	},

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

    /**
     * Cross-app navigate from DZNP-manage -> DZNP-podani
     * Keeps deep link to FormDLO(...) and passes mode=edit.
     * Called from row/chevron press handler.
     */
    navToPodaniFromManage: async function (extensionAPI, oRowContext, sMode) {
      try {
        if (!oRowContext) {
          Log.warning("DZNP: navToPodaniFromManage called without row context");
          return Promise.reject(new Error("no row context"));
        }

        // 1) vytažení klíčů z řádku (přizpůsob podle svého modelu)
        const o = oRowContext.getObject();
        const sPernr = o.PersonalNumber;
        const sSubty = o.BenefitSubtype;
        const sBegda = o.ValidFromDate;
        const sEndda = o.ValidToDate;
        const sSeqnr = o.SequenceNumber;

        // 2) rozhodnutí jaká route v podani appce (FPM stránky)
        const mPageBySubtype = {
          DLO: "FormDLO",
          OSE: "FormOSE",
          OPP: "FormOPP",
          PPM: "FormPPM"
        };
        const sPage = mPageBySubtype[sSubty] || `Form${sSubty}`;

        // Parametry route (uprav podle target appky, pokud se názvy liší)
        const mKey = {
          pernr: "PersonalNumber",
          subty: "BenefitSubtype",
          begda: "ValidFromDate",
          endda: "ValidToDate",
          seqnr: "SequenceNumber"
        };

        const fnParam = function (v, bQuoteString) {
          if (v === null || v === undefined || v === "") {
            return "null";
          }
          const s = String(v);
          const bIsNumeric = /^-?\d+(?:\.\d+)?$/.test(s);
          const bIsTypedLiteral = /^(?:datetimeoffset|date|time|guid)'/i.test(s);
          const sEncoded = encodeURIComponent(s);

          if (!bQuoteString || bIsNumeric || bIsTypedLiteral) {
            return sEncoded;
          }
          return `'${sEncoded}'`;
        };

        // 3) deep link route (tohle je to, co má být za &/ v cílové aplikaci)
        const sAppSpecificRoute =
          `${sPage}(` +
          `${mKey.pernr}=${fnParam(sPernr, true)},` +
          `${mKey.subty}=${fnParam(sSubty, true)},` +
          `${mKey.begda}=${fnParam(sBegda, false)},` +
          `${mKey.endda}=${fnParam(sEndda, false)},` +
          `${mKey.seqnr}=${fnParam(sSeqnr, true)}` +
          `)/`;

  const sRouteWithMode = sMode ? `${sAppSpecificRoute}?mode=${encodeURIComponent(sMode)}` : sAppSpecificRoute;

  Log.info("DZNP: Outbound appSpecificRoute = " + sRouteWithMode);

        // Prefer CrossApplicationNavigation to avoid extra intent parameters (e.g. ScopeMode)
        if (window.sap && sap.ushell && sap.ushell.Container && sap.ushell.Container.getServiceAsync) {
          Log.info("DZNP: navigating via CrossApplicationNavigation");
          const oCrossAppNav = await sap.ushell.Container.getServiceAsync("CrossApplicationNavigation");
          return oCrossAppNav.toExternal({
            target: {
              semanticObject: "DZNP",
              action: "podani"
            },
            appSpecificRoute: sRouteWithMode,
            params: {}
          });
        }

        // fallback: FE intentBasedNavigation
        const oIBN = extensionAPI && extensionAPI.intentBasedNavigation;
        if (oIBN && oIBN.navigateOutbound) {
          Log.info("DZNP: navigating via intentBasedNavigation");
          return oIBN.navigateOutbound("toPodani", {
            appSpecificRoute: sRouteWithMode
          });
        }

        Log.warning("DZNP: No navigation service available (not running in FLP?)");
        return Promise.reject(new Error("no navigation service"));
      } catch (e) {
        Log.error("DZNP: navToPodaniFromManage failed", e);
        return Promise.reject(e);
      }
    },

    // =========================================================
    // Wire row press -> outbound navigation (fallback when no XML wiring)
    // =========================================================
    _wireTableRowPressNavigation: function () {
      if (this._bNavWired) {
        return;
      }

      const oTB = this._getTableAndBinding();
      if (!oTB) {
        setTimeout(this._wireTableRowPressNavigation.bind(this), 250);
        return;
      }

      const oTableApi = oTB.oTableApi;
      const oTable = oTB.oTable;
      const oBinding = oTB.oBinding;

      const fnHandler = function (oEvent) {
        const oCtx = this._getRowContextFromEvent(oEvent);
        if (oCtx) {
          this._lastRowContext = oCtx;
          this.navToPodaniFromManage(this.base.getExtensionAPI(), oCtx, "edit");
        } else {
          Log.warning("DZNP: row press without context");
        }
      }.bind(this);

      let bAttached = false;

      if (oTableApi && oTableApi.attachRowPress) {
        oTableApi.attachRowPress(fnHandler);
        bAttached = true;
      }

      if (!bAttached && oTable && oTable.attachItemPress) {
        oTable.attachItemPress(fnHandler);
        bAttached = true;
      }

      if (!bAttached && oTable && oTable.attachRowSelectionChange) {
        oTable.attachRowSelectionChange(fnHandler);
        bAttached = true;
      }

      if (oBinding && oBinding.attachEventOnce) {
        oBinding.attachEventOnce("dataReceived", function () {
          const oFirst = this._getFirstContextFromBinding(oBinding);
          if (oFirst) {
            this._lastRowContext = oFirst;
            Log.info("DZNP: stored first row context from dataReceived");
          }
        }.bind(this));
      }

      this._bNavWired = bAttached;
      Log.info("DZNP: row press navigation wired = " + bAttached);
    },

    _getRowContextFromEvent: function (oEvent) {
      if (!oEvent || !oEvent.getParameter) {
        return null;
      }

      const oRowCtx = oEvent.getParameter("rowContext");
      if (oRowCtx) {
        return oRowCtx;
      }

      const oItem = oEvent.getParameter("listItem") || oEvent.getParameter("item");
      if (oItem && oItem.getBindingContext) {
        return oItem.getBindingContext();
      }

      const oSource = oEvent.getSource && oEvent.getSource();
      if (oSource && oSource.getBindingContext) {
        return oSource.getBindingContext();
      }

      return null;
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

      // Seckar
	    const sYear = this._byFragId("dznpInpYear").getValue();
	    const sValidFromDateFrom = sYear + "-01-01";
	    const sValidFromDateTo = sYear + "-12-31";

      return {
        scopeMode: sScopeValue,
        orgUnit: sOrgKey,
        //Seckar
		    validFromDateFrom: sValidFromDateFrom,
		    validFromDateTo: sValidFromDateTo
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

        // ValidFromDate jako range (Between)
        oConds.ValidFromDate = [{
          operator: "BT",
          values: [
            v.validFromDateFrom,
            v.validFromDateTo
          ],
          validated: "Validated"
        }];

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

      let oBinding = null;
      if (oTable.getRowBinding) {
        oBinding = oTable.getRowBinding();
      }

      if (!oBinding) {
        const sAggr = oTable.isA("sap.ui.table.Table") ? "rows" : "items";
        oBinding = oTable.getBinding(sAggr);
      }

      if (!oBinding) {
        return null;
      }

      return { oTableApi, oTable, oBinding };
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

      //Seckar
      aFilters.push(
        new Filter(
          "ValidFromDate",
          FilterOperator.BT,
          v.validFromDateFrom,
          v.validFromDateTo
        )
      );	

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

      //Seckar
		  // Year
		  const currentYear = new Date().getFullYear();
		  this._byFragId("dznpInpYear").setValue(currentYear);

          // inicializační sync (výchozí je Vedoucí => MGR)
          this._syncFeFiltersAndSearch();

          return;
        }

        Log.warning("DZNP: Parent is not sap.f.DynamicPage – runtime struktura se změnila.");
      } catch (e) {
        Log.error("DZNP: _injectCriteriaAboveTable FAILED", e);
      }
    }

    ,

    /**
     * Handler for chevron/row press to navigate outbound to podani app
     */
    onChevronPressNavigateOutBound: function (oEvent) {
      try {
        Log.info("DZNP: Test nav button pressed");
        const oSource = oEvent.getSource && oEvent.getSource();
        let oCtx = oSource && oSource.getBindingContext && oSource.getBindingContext();

        if (!oCtx) {
          oCtx = this._lastRowContext || null;
        }

        if (!oCtx) {
          oCtx = this._getSelectedRowContextFromTable();
        }

        if (!oCtx) {
          return this._getFirstRowContextAsync(5, 300)
            .then(function (oResolvedCtx) {
              if (oResolvedCtx) {
                return oResolvedCtx;
              }
              return this._getFirstRowContextFromModel();
            }.bind(this))
            .then(function (oResolvedCtx) {
              if (!oResolvedCtx) {
                Log.warning("DZNP: no row context available yet - wait for data or click a row once");
                MessageToast.show("Nenalezen žádný řádek. Počkej na data nebo klikni na řádek.");
                return null;
              }
              return this.navToPodaniFromManage(this.base.getExtensionAPI(), oResolvedCtx, "edit");
            }.bind(this));
        }

        return this.navToPodaniFromManage(this.base.getExtensionAPI(), oCtx, "edit");
      } catch (e) {
        Log.error("DZNP: onChevronPressNavigateOutBound failed", e);
        MessageToast.show("Chyba při navigaci – podrobnosti v konzoli.");
      }
    }
    ,

    _getSelectedRowContextFromTable: function () {
      const oTB = this._getTableAndBinding();
      if (!oTB) {
        return null;
      }

      const oTable = oTB.oTable;
      const oBinding = oTB.oBinding;

      if (oTable && oTable.getSelectedContexts) {
        const aSel = oTable.getSelectedContexts();
        return aSel && aSel[0];
      }

      if (oTable && oTable.getSelectedIndex && oTable.getContextByIndex) {
        const iIdx = oTable.getSelectedIndex();
        if (iIdx >= 0) {
          return oTable.getContextByIndex(iIdx);
        }
      }

      if (oTable && oTable.getSelectedItem && oTable.getSelectedItem()) {
        const oItem = oTable.getSelectedItem();
        return oItem && oItem.getBindingContext && oItem.getBindingContext();
      }

      return this._getFirstContextFromBinding(oBinding);

      return null;
    },

    _getFirstRowContextAsync: function (iRetries, iDelayMs) {
      const oTB = this._getTableAndBinding();
      if (!oTB || !oTB.oBinding) {
        return Promise.resolve(null);
      }

      const oBinding = oTB.oBinding;
      const oFirst = this._getFirstContextFromBinding(oBinding);
      if (oFirst) {
        return Promise.resolve(oFirst);
      }

      if (iRetries <= 0) {
        return Promise.resolve(null);
      }

      return new Promise(function (resolve) {
        setTimeout(function () {
          this._getFirstRowContextAsync(iRetries - 1, iDelayMs).then(resolve);
        }.bind(this), iDelayMs);
      }.bind(this));
    },

    _getFirstContextFromBinding: function (oBinding) {
      if (!oBinding) {
        return null;
      }

      if (oBinding.getContexts) {
        const aCtx = oBinding.getContexts(0, 1);
        if (aCtx && aCtx[0]) {
          return aCtx[0];
        }
      }

      if (oBinding.getCurrentContexts) {
        const aCtx = oBinding.getCurrentContexts();
        if (aCtx && aCtx[0]) {
          return aCtx[0];
        }
      }

      if (oBinding.getAllCurrentContexts) {
        const aCtx = oBinding.getAllCurrentContexts();
        if (aCtx && aCtx[0]) {
          return aCtx[0];
        }
      }

      return null;
    },

    _getFirstRowContextFromModel: function () {
      try {
        const oModel = this.base.getView().getModel();
        if (!oModel || !oModel.requestContexts) {
          return Promise.resolve(null);
        }

        return oModel.requestContexts("/ManagerWorklist", 0, 1).then(function (aCtx) {
          return aCtx && aCtx[0];
        });
      } catch (e) {
        Log.warning("DZNP: failed to request contexts from model", e);
        return Promise.resolve(null);
      }
    }
  });
});
