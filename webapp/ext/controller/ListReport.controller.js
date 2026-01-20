sap.ui.define(['sap/ui/core/mvc/ControllerExtension','sap/ui/core/Fragment'], function (ControllerExtension, Fragment) {
	'use strict';

	return ControllerExtension.extend('dznp.ext.controller.ListReport', {
		// this section allows to extend lifecycle hooks or hooks provided by Fiori elements
		override: {
			/**
             * Called when a controller is instantiated and its View controls (if available) are already created.
             * Can be used to modify the View before it is displayed, to bind event handlers and do other one-time initialization.
             * @memberOf dznp.ext.controller.ListReport
             */
			onAfterRendering: function () {
        		this._injectCriteriaAboveTable();
      		},

			onInit: function () {
				// you can access the Fiori elements extensionAPI via this.base.getExtensionAPI
				var oModel = this.base.getExtensionAPI().getModel();
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

		_getSetCurrentYear: async function () {
			const oYear = new Date().getFullYear();
			const oInpYear = sap.ui.getCore().byId("dznpInpYear");
			oInpYear.setValue(oYear);
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
			this._setApproverFieldsWithRetry(1);
			this._getSetCurrentYear();
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
