sap.ui.define([
  "sap/ui/core/mvc/ControllerExtension",
  "sap/ui/core/Fragment",
  "sap/m/VBox",
  "sap/base/Log",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/m/MessageToast",
  "sap/m/BusyDialog",
  "sap/m/InstanceManager"
], function (ControllerExtension, Fragment, VBox, Log, Filter, FilterOperator, MessageToast, BusyDialog, InstanceManager) {
  "use strict";

  return ControllerExtension.extend("dznp.ext.controller.ListReport", {
    override: {
      onAfterRendering: function () {
        this._injectCriteriaAboveTable();
        this._wireTableRowPressNavigation();
        this._attachActionRefresh();
        this._attachActionButtonPress();
        this._patchInvokeActionRefresh();
        this._patchODataContextExecute();
        this._monitorActionDialogs();
        this._overrideIntentBasedNavigation();
        this._overrideCrossApplicationNavigation();
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
    navToPodaniFromManage: async function (extensionAPI, oRowContext, sMode, bSkipIBNFallback) {
      try {
        if (!oRowContext) {
          Log.warning("DZNP: navToPodaniFromManage called without row context");
          return Promise.reject(new Error("no row context"));
        }

        const o = oRowContext.getObject ? oRowContext.getObject() : oRowContext;
        if (!o) {
          Log.warning("DZNP: navToPodaniFromManage missing object data");
          return Promise.reject(new Error("no object data"));
        }

        const sModeEffective = sMode ? String(sMode) : "view";
        const oRouteParts = this._buildPodaniRouteParts(o, sModeEffective);
        if (!oRouteParts) {
          return Promise.reject(new Error("invalid route parts"));
        }

        const sAppSpecificRoute = oRouteParts.appSpecificRoute;
        const sShellHash = oRouteParts.shellHash;

        // params that MUST appear in hash (before &/)
        const mParams = {};

        // Prefer shellHash navigation to avoid extra intent parameters (e.g. ScopeMode)
        if (window.sap && sap.ushell && sap.ushell.Container && sap.ushell.Container.getServiceAsync) {
          Log.info("DZNP: navigating via CrossApplicationNavigation (shellHash)");
          return this._toExternalShellHash(sShellHash);
        }

        // fallback: FE intentBasedNavigation
        const oIBN = extensionAPI && extensionAPI.intentBasedNavigation;
        if (!bSkipIBNFallback && oIBN && oIBN.navigateOutbound) {
          Log.info("DZNP: navigating via intentBasedNavigation (fallback)");
          return oIBN.navigateOutbound("toPodani", mParams, sAppSpecificRoute);
        }

        Log.warning("DZNP: No navigation service available (not running in FLP?)");
        return Promise.reject(new Error("no navigation service"));
      } catch (e) {
        Log.error("DZNP: navToPodaniFromManage failed", e);
        return Promise.reject(e);
      }
    },

    _buildPodaniRouteParts: function (oData, sModeEffective) {
      const sPernr = oData.PersonalNumber;
      const sSubtyRaw = oData.BenefitSubtype;
      const sSubty = (sSubtyRaw !== null && sSubtyRaw !== undefined)
        ? String(sSubtyRaw).trim().toUpperCase()
        : "";
      const sBegda = oData.ValidFromDate;
      const sEndda = oData.ValidToDate;
      const sSeqnr = oData.SequenceNumber;

      Log.info("DZNP: navigating with row context", {
        PersonalNumber: sPernr,
        BenefitSubtype: sSubty,
        ValidFromDate: sBegda,
        ValidToDate: sEndda,
        SequenceNumber: sSeqnr
      });

      const mPageBySubtype = {
        DLO: "FormDLO",
        OSE: "FormOSE",
        OPP: "FormOPP",
        PPM: "FormPPM"
      };

      let sPage = mPageBySubtype[sSubty];

      if (!sPage) {
        const sText = oData.BenefitSubtypeText ? String(oData.BenefitSubtypeText).toUpperCase() : "";
        if (sText.indexOf("DLO") !== -1) {
          sPage = "FormDLO";
        } else if (sText.indexOf("OSE") !== -1) {
          sPage = "FormOSE";
        } else if (sText.indexOf("OPP") !== -1) {
          sPage = "FormOPP";
        } else if (sText.indexOf("PPM") !== -1) {
          sPage = "FormPPM";
        }
      }

      if (!sPage) {
        sPage = `Form${sSubty}`;
      }

      Log.info("DZNP: route selected", { subtype: sSubty, page: sPage });

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
        const bIsTypedLiteral = /^(?:datetimeoffset|date|time|guid)'/i.test(s);
        const sEncoded = encodeURIComponent(s);

        if (!bQuoteString || bIsTypedLiteral) {
          return sEncoded;
        }
        return `'${sEncoded}'`;
      };

      const sAppSpecificRoute =
        `${sPage}(` +
        `${mKey.pernr}=${fnParam(sPernr, true)},` +
        `${mKey.subty}=${fnParam(sSubty, true)},` +
        `${mKey.begda}=${fnParam(sBegda, false)},` +
        `${mKey.endda}=${fnParam(sEndda, false)},` +
        `${mKey.seqnr}=${fnParam(sSeqnr, true)}` +
        `)/?mode=${encodeURIComponent(sModeEffective)}`;

      Log.info("DZNP: Outbound appSpecificRoute = " + sAppSpecificRoute);

      const sShellHash = `DZNP-podani&/${sAppSpecificRoute}`;
      Log.info("DZNP: Outbound shellHash = " + sShellHash);

      return {
        appSpecificRoute: sAppSpecificRoute,
        shellHash: sShellHash
      };
    },

    _toExternalShellHash: async function (sShellHash) {
      const oCrossAppNav = await sap.ushell.Container.getServiceAsync("CrossApplicationNavigation");
      return oCrossAppNav.toExternal({
        target: {
          shellHash: sShellHash
        }
      });
    },

    _overrideIntentBasedNavigation: function () {
      if (this._bIBNPatched) {
        return;
      }

      const oExtApi = this.base && this.base.getExtensionAPI && this.base.getExtensionAPI();
      const oIBN = oExtApi && oExtApi.intentBasedNavigation;

      if (!oIBN || !oIBN.navigateOutbound) {
        setTimeout(this._overrideIntentBasedNavigation.bind(this), 250);
        return;
      }

      const fnOriginal = oIBN.navigateOutbound.bind(oIBN);

      oIBN.navigateOutbound = function (sOutbound, mParams, sAppSpecificRoute) {
        if (sOutbound === "toPodani") {
          Log.info("DZNP: intercepted intentBasedNavigation toPodani");
          return this._navToPodaniFromParams(oExtApi, mParams);
        }
        return fnOriginal(sOutbound, mParams, sAppSpecificRoute);
      }.bind(this);

      this._bIBNPatched = true;
      Log.info("DZNP: intentBasedNavigation patched");
    },

    _overrideCrossApplicationNavigation: function () {
      if (this._bCrossAppPatched) {
        return;
      }

      if (!(window.sap && sap.ushell && sap.ushell.Container && sap.ushell.Container.getServiceAsync)) {
        setTimeout(this._overrideCrossApplicationNavigation.bind(this), 250);
        return;
      }

      sap.ushell.Container.getServiceAsync("CrossApplicationNavigation")
        .then(function (oCrossAppNav) {
          if (!oCrossAppNav || !oCrossAppNav.toExternal) {
            return;
          }

          const fnOriginal = oCrossAppNav.toExternal.bind(oCrossAppNav);

          oCrossAppNav.toExternal = function (oArgs) {
            if (oArgs && oArgs.target && oArgs.target.semanticObject === "DZNP" && oArgs.target.action === "podani") {
              Log.info("DZNP: intercepted CrossApplicationNavigation toExternal for DZNP-podani");
              const oRouteParts = this._buildPodaniRouteParts(oArgs.params || {}, "view");
              if (oRouteParts) {
                return fnOriginal({
                  target: {
                    shellHash: oRouteParts.shellHash
                  }
                });
              }
            }
            return fnOriginal(oArgs);
          }.bind(this);

          this._bCrossAppPatched = true;
          Log.info("DZNP: CrossApplicationNavigation patched");
        }.bind(this))
        .catch(function (e) {
          Log.warning("DZNP: CrossApplicationNavigation patch failed", e);
        });
    },

    _navToPodaniFromParams: function (extensionAPI, mParams) {
      const fnGet = function (sKey) {
        const v = mParams && mParams[sKey];
        if (Array.isArray(v)) {
          return v[0];
        }
        if (v && typeof v === "object" && v.value !== undefined) {
          return v.value;
        }
        return v;
      };

      const oData = {
        PersonalNumber: fnGet("PersonalNumber"),
        BenefitSubtype: fnGet("BenefitSubtype"),
        ValidFromDate: fnGet("ValidFromDate"),
        ValidToDate: fnGet("ValidToDate"),
        SequenceNumber: fnGet("SequenceNumber"),
        BenefitSubtypeText: fnGet("BenefitSubtypeText")
      };

      return this.navToPodaniFromManage(extensionAPI, oData, "view", true);
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

  this._ensureNavigationRowType(oTable);

      const fnHandler = function (oEvent) {
        if (oEvent) {
          if (oEvent.preventDefault) {
            oEvent.preventDefault();
          }
          if (oEvent.stopPropagation) {
            oEvent.stopPropagation();
          }
        }
        const oCtx = this._getRowContextFromEvent(oEvent);
        if (oCtx) {
          this._lastRowContext = oCtx;
          this.navToPodaniFromManage(this.base.getExtensionAPI(), oCtx, "view");
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

    _ensureNavigationRowType: function (oTable) {
      try {
        if (!oTable || !oTable.isA) {
          return;
        }

        if (oTable.isA("sap.m.Table")) {
          const fnApply = function () {
            const aItems = oTable.getItems ? oTable.getItems() : [];
            aItems.forEach(function (oItem) {
              if (oItem && oItem.setType) {
                oItem.setType("Navigation");
              }
            });
          };

          if (oTable.attachUpdateFinished) {
            oTable.attachUpdateFinished(fnApply);
          }

          fnApply();
          Log.info("DZNP: ensured Navigation row type on sap.m.Table");
        }
      } catch (e) {
        Log.warning("DZNP: _ensureNavigationRowType failed", e);
      }
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
    // Refresh table after approve/reject actions
    // =========================================================
    _attachActionRefresh: function () {
      if (this._bActionRefreshAttached) {
        return;
      }

      const oExtApi = this.base && this.base.getExtensionAPI && this.base.getExtensionAPI();
      const oModel = oExtApi && oExtApi.getModel && oExtApi.getModel();

      if (!oModel) {
        setTimeout(this._attachActionRefresh.bind(this), 250);
        return;
      }

      const fnHandleRequest = function (oEvent) {
        try {
          Log.info("DZNP: batch request completed handler fired");
          const oParams = oEvent && oEvent.getParameters && oEvent.getParameters();
          const aRequests = (oParams && (oParams.requests || oParams.batchRequests)) || [];
          const sUrl = oParams && (oParams.url || oParams.requestUrl);

          Log.info("DZNP: completed params", {
            url: sUrl,
            requestsCount: aRequests.length
          });

          let bMatch = false;
          let sKeyPredicate = null;

          if (sUrl && /approveByManager|rejectByManager/i.test(sUrl)) {
            bMatch = true;
            sKeyPredicate = this._extractKeyPredicate(sUrl);
          }

          if (!bMatch && Array.isArray(aRequests)) {
            bMatch = aRequests.some(function (oReq) {
              const sReqUrl = oReq && (oReq.url || oReq.requestUrl || oReq._url);
              if (sReqUrl && /approveByManager|rejectByManager/i.test(sReqUrl)) {
                sKeyPredicate = this._extractKeyPredicate(sReqUrl) || sKeyPredicate;
                return true;
              }
              return false;
            });
          }

          if (bMatch) {
            this._showActionBusy();
            if (sKeyPredicate) {
              this._lastActionKeyPredicate = sKeyPredicate;
              this._removeRowByKeyPredicate(sKeyPredicate);
            }
            setTimeout(this._refreshTableAfterAction.bind(this), 0);
          } else {
            this._hideActionBusy();
          }
        } catch (e) {
          Log.warning("DZNP: action refresh handler failed", e);
          this._hideActionBusy();
        }
      }.bind(this);

      const fnHandleRequestSent = function (oEvent) {
        try {
          Log.info("DZNP: batch request sent handler fired");
          const oParams = oEvent && oEvent.getParameters && oEvent.getParameters();
          const aRequests = (oParams && (oParams.requests || oParams.batchRequests)) || [];
          const sUrl = oParams && (oParams.url || oParams.requestUrl);

          Log.info("DZNP: sent params", {
            url: sUrl,
            requestsCount: aRequests.length
          });

          let bMatch = false;

          if (sUrl && /approveByManager|rejectByManager/i.test(sUrl)) {
            bMatch = true;
          }

          if (!bMatch && Array.isArray(aRequests)) {
            bMatch = aRequests.some(function (oReq) {
              const sReqUrl = oReq && (oReq.url || oReq.requestUrl || oReq._url);
              return sReqUrl && /approveByManager|rejectByManager/i.test(sReqUrl);
            });
          }

          if (bMatch) {
            this._showActionBusy();
          }
        } catch (e) {
          Log.warning("DZNP: action requestSent handler failed", e);
        }
      }.bind(this);

      if (oModel.attachBatchRequestCompleted) {
        Log.info("DZNP: attaching batchRequestCompleted");
        oModel.attachBatchRequestCompleted(fnHandleRequest);
      } else {
        Log.warning("DZNP: batch request completed event not available on model");
      }

      if (oModel.attachBatchRequestSent) {
        Log.info("DZNP: attaching batchRequestSent");
        oModel.attachBatchRequestSent(fnHandleRequestSent);
      } else {
        Log.warning("DZNP: batch request sent event not available on model");
      }

      this._bActionRefreshAttached = true;
    },

    _refreshTableAfterAction: function () {
      // Primární refresh: přímý refresh na OData list binding
      try {
        const oTB = this._getTableAndBinding();
        if (oTB) {
          // 1) refresh binding -> nový $batch GET request
          if (oTB.oBinding && oTB.oBinding.refresh) {
            Log.info("DZNP: refreshing OData binding after action");
            oTB.oBinding.refresh();
          }
          // 2) rebind přes TableAPI pokud dostupné
          if (oTB.oTableApi) {
            if (oTB.oTableApi.rebind) {
              oTB.oTableApi.rebind();
            } else if (oTB.oTableApi.refresh) {
              oTB.oTableApi.refresh();
            }
          }
        } else {
          Log.info("DZNP: TableAPI not found, falling back to FilterBar triggerSearch");
        }
      } catch (e) {
        Log.warning("DZNP: binding refresh failed", e);
      }

      // Záloha: triggerSearch na FE FilterBar (vždy, zajistí i re-aplikaci filtrů)
      try {
        const oFilterBar = this._getFeFilterBar();
        if (oFilterBar) {
          if (oFilterBar.triggerSearch) {
            Log.info("DZNP: triggerSearch on FilterBar after action");
            oFilterBar.triggerSearch();
          } else if (oFilterBar.fireSearch) {
            oFilterBar.fireSearch();
          }
        }
      } catch (e) {
        Log.warning("DZNP: FilterBar triggerSearch failed after action", e);
      }

      this._hideActionBusy();
    },

    _attachActionButtonPress: function () {
      if (this._bActionButtonPressAttached) {
        return;
      }

      const oView = this.base.getView();
      const aButtons = oView.findAggregatedObjects(true, function (o) {
        return o && o.isA && o.isA("sap.m.Button");
      });

      if (!aButtons || !aButtons.length) {
        return;
      }

      const rAction = /approveByManager|rejectByManager/i;

      aButtons.forEach(function (oButton) {
        if (oButton.data("dznpActionHooked")) {
          return;
        }

        const sId = oButton.getId && oButton.getId();
        const aCustomData = oButton.getCustomData ? oButton.getCustomData() : [];

        const bMatchesId = sId && rAction.test(sId);
        const bMatchesData = Array.isArray(aCustomData) && aCustomData.some(function (oData) {
          const sKey = oData && oData.getKey && oData.getKey();
          const vVal = oData && oData.getValue && oData.getValue();
          return rAction.test(String(sKey || "")) || rAction.test(String(vVal || ""));
        });

        if (!bMatchesId && !bMatchesData) {
          return;
        }

        oButton.data("dznpActionHooked", true);
        oButton.attachPress(function (oEvent) {
          try {
            this._showActionBusy();
            const oSource = oEvent.getSource && oEvent.getSource();
            const oCtx = oSource && oSource.getBindingContext && oSource.getBindingContext();
            const oObj = oCtx && oCtx.getObject && oCtx.getObject();

            const sKeyPredicate = this._buildKeyPredicateFromContext(oObj);
            if (sKeyPredicate) {
              this._removeRowByKeyPredicate(sKeyPredicate);
            }

            setTimeout(this._refreshTableAfterAction.bind(this), 400);
          } catch (e) {
            Log.warning("DZNP: action button press handler failed", e);
          }
        }.bind(this));
      }.bind(this));

      this._bActionButtonPressAttached = true;
    },

    _patchInvokeActionRefresh: function () {
      if (this._bInvokeActionPatched) {
        return;
      }

      if (Log && Log.setLevel && Log.Level) {
        Log.setLevel(Log.Level.INFO);
      }

      const oExtApi = this.base && this.base.getExtensionAPI && this.base.getExtensionAPI();
      if (!oExtApi || !oExtApi.invokeAction) {
        return;
      }

      const fnOriginal = oExtApi.invokeAction.bind(oExtApi);
      oExtApi.invokeAction = function () {
        const aArgs = Array.prototype.slice.call(arguments);
        console.info("DZNP: invokeAction called", aArgs);

        const vResult = fnOriginal.apply(oExtApi, aArgs);
        return Promise.resolve(vResult)
          .then(function (v) {
            console.info("DZNP: invokeAction resolved");
            this._refreshTableAfterAction();
            return v;
          }.bind(this))
          .catch(function (e) {
            console.info("DZNP: invokeAction rejected", e);
            this._refreshTableAfterAction();
            throw e;
          }.bind(this));
      }.bind(this);

      this._bInvokeActionPatched = true;
    },

    _patchODataContextExecute: function () {
      if (this._bContextExecutePatched) {
        return;
      }

      const oContextProto = sap && sap.ui && sap.ui.model && sap.ui.model.odata && sap.ui.model.odata.v4 && sap.ui.model.odata.v4.Context && sap.ui.model.odata.v4.Context.prototype;
      if (!oContextProto || !oContextProto.execute) {
        return;
      }

      const fnOriginal = oContextProto.execute;
      const rAction = /approveByManager|rejectByManager/i;
      const oController = this;

      oContextProto.execute = function () {
        const oContext = this; // skutečný OData Context objekt
        const sPath = oContext.getPath && oContext.getPath();
        const bIsAction = sPath && rAction.test(sPath);
        const sKeyPredicate = bIsAction ? oController._extractKeyPredicate(sPath) : null;

        if (bIsAction) {
          console.info("DZNP: Context.execute for action", { path: sPath, keyPredicate: sKeyPredicate });
        }

        const vResult = fnOriginal.apply(oContext, arguments); // správný this = OData Context
        if (!bIsAction) {
          return vResult;
        }

        return Promise.resolve(vResult)
          .then(function (v) {
            console.info("DZNP: Context.execute resolved", { path: sPath });
            if (sKeyPredicate) {
              oController._removeRowByKeyPredicate(sKeyPredicate);
            }
            oController._refreshTableAfterAction();
            return v;
          })
          .catch(function (e) {
            console.info("DZNP: Context.execute rejected", { path: sPath, error: e });
            if (sKeyPredicate) {
              oController._removeRowByKeyPredicate(sKeyPredicate);
            }
            oController._refreshTableAfterAction();
            throw e;
          });
      };

      this._bContextExecutePatched = true;
    },

    _monitorActionDialogs: function () {
      if (this._bActionDialogMonitor) {
        return;
      }

      const rAction = /approveByManager|rejectByManager/i;
      const rDialog = /fe::APD_::/i;

      const fnAttach = function () {
        const aDialogs = InstanceManager.getOpenDialogs ? InstanceManager.getOpenDialogs() : [];
        aDialogs.forEach(function (oDialog) {
          const sId = oDialog && oDialog.getId && oDialog.getId();
          if (!sId || !rDialog.test(sId) || !rAction.test(sId)) {
            return;
          }

          if (oDialog.data("dznpActionDialogHooked")) {
            return;
          }

          oDialog.data("dznpActionDialogHooked", true);
          console.info("DZNP: action dialog detected", sId);

          oDialog.attachAfterClose(function () {
            console.info("DZNP: action dialog closed, refreshing list");
            setTimeout(this._refreshTableAfterAction.bind(this), 300);
          }.bind(this));
        }.bind(this));

        setTimeout(fnAttach, 500);
      }.bind(this);

      fnAttach();
      this._bActionDialogMonitor = true;
    },

    _buildKeyPredicateFromContext: function (oObj) {
      if (!oObj) {
        return null;
      }

      const sPernr = oObj.PersonalNumber;
      const sSubty = oObj.BenefitSubtype;
      const sBegda = oObj.ValidFromDate;
      const sEndda = oObj.ValidToDate;
      const sSeqnr = oObj.SequenceNumber;

      if (!sPernr || !sSubty || !sBegda || !sEndda || !sSeqnr) {
        return null;
      }

      const esc = function (v) {
        return String(v).replace(/'/g, "''");
      };

      return "PersonalNumber='" + esc(sPernr) + "'," +
        "BenefitSubtype='" + esc(sSubty) + "'," +
        "ValidFromDate=" + sBegda + "," +
        "ValidToDate=" + sEndda + "," +
        "SequenceNumber='" + esc(sSeqnr) + "'";
    },

    _extractKeyPredicate: function (sUrl) {
      if (!sUrl) {
        return null;
      }

      const oMatch = /ManagerWorklist\(([^)]+)\)/.exec(sUrl);
      return oMatch && oMatch[1] ? oMatch[1] : null;
    },

    _removeRowByKeyPredicate: function (sKeyPredicate) {
      if (!sKeyPredicate) {
        return;
      }

      const oTB = this._getTableAndBinding();
      if (!oTB || !oTB.oTable) {
        return;
      }

      const oTable = oTB.oTable;
      const sKeyPath = "ManagerWorklist(" + sKeyPredicate + ")";
      const oKeyMap = this._parseKeyPredicate(sKeyPredicate);

      Log.info("DZNP: remove row by key predicate", {
        keyPredicate: sKeyPredicate,
        keyPath: sKeyPath,
        tableType: oTable && oTable.getMetadata && oTable.getMetadata().getName()
      });

      if (oTable.isA && oTable.isA("sap.m.Table")) {
        const aItems = oTable.getItems ? oTable.getItems() : [];
        aItems.forEach(function (oItem) {
          const oCtx = oItem && oItem.getBindingContext && oItem.getBindingContext();
          const sPath = oCtx && oCtx.getPath && oCtx.getPath();
          const oObj = oCtx && oCtx.getObject && oCtx.getObject();
          const bObjMatch = this._doesObjectMatchKey(oObj, oKeyMap);
          if (sPath && sPath.indexOf(sKeyPath) !== -1) {
            Log.info("DZNP: removing table item", { path: sPath });
            oTable.removeItem(oItem);
          } else if (bObjMatch) {
            Log.info("DZNP: removing table item by object match", { path: sPath });
            oTable.removeItem(oItem);
          } else if (sPath) {
            Log.info("DZNP: row did not match", { path: sPath });
          }
        }.bind(this));
      }
    },

    _parseKeyPredicate: function (sKeyPredicate) {
      if (!sKeyPredicate) {
        return null;
      }

      const oMap = {};
      const rKey = /([A-Za-z0-9_]+)=('([^']*)'|([^,]+))/g;
      let m;
      while ((m = rKey.exec(sKeyPredicate)) !== null) {
        const sKey = m[1];
        const sVal = m[3] !== undefined ? m[3] : (m[4] || "").trim();
        oMap[sKey] = sVal;
      }
      return oMap;
    },

    _doesObjectMatchKey: function (oObj, oKeyMap) {
      if (!oObj || !oKeyMap) {
        return false;
      }

      return String(oObj.PersonalNumber || "") === String(oKeyMap.PersonalNumber || "") &&
        String(oObj.BenefitSubtype || "") === String(oKeyMap.BenefitSubtype || "") &&
        String(oObj.ValidFromDate || "") === String(oKeyMap.ValidFromDate || "") &&
        String(oObj.ValidToDate || "") === String(oKeyMap.ValidToDate || "") &&
        String(oObj.SequenceNumber || "") === String(oKeyMap.SequenceNumber || "");
    },

    _showActionBusy: function () {
      if (!this._oActionBusyDialog) {
        this._oActionBusyDialog = new BusyDialog({
          text: "Vydržte, schvaluji požadavek"
        });
      }

      if (this._bActionBusyOpen) {
        return;
      }

      this._bActionBusyOpen = true;
      this._iActionBusyStart = Date.now();
      this._oActionBusyDialog.open();
    },

    _hideActionBusy: function () {
      if (!this._bActionBusyOpen || !this._oActionBusyDialog) {
        return;
      }

      const iElapsed = Date.now() - (this._iActionBusyStart || 0);
      const iRemaining = Math.max(1000 - iElapsed, 0);

      setTimeout(function () {
        if (!this._oActionBusyDialog) {
          return;
        }

        this._oActionBusyDialog.close();
        this._bActionBusyOpen = false;
        this._iActionBusyStart = null;
      }.bind(this), iRemaining);
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

      let oTable = aTables && aTables[0];
      if (!oTable) {
        return null;
      }

      if (oTable.getMetadata) {
        Log.info("DZNP: Table found = " + oTable.getMetadata().getName());
      }

      if (oTable.isA && oTable.isA("sap.ui.mdc.Table") && oTable.getTable) {
        const oInnerTable = oTable.getTable();
        if (oInnerTable) {
          if (oInnerTable.getMetadata) {
            Log.info("DZNP: Inner table = " + oInnerTable.getMetadata().getName());
          }
          oTable = oInnerTable;
        }
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
      return this.navToPodaniFromManage(this.base.getExtensionAPI(), oResolvedCtx, "view");
            }.bind(this));
        }

    return this.navToPodaniFromManage(this.base.getExtensionAPI(), oCtx, "view");
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
