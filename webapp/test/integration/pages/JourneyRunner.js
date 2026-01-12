sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"dznp/test/integration/pages/ManagerWorklistList",
	"dznp/test/integration/pages/ManagerWorklistObjectPage"
], function (JourneyRunner, ManagerWorklistList, ManagerWorklistObjectPage) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('dznp') + '/test/flp.html#app-preview',
        pages: {
			onTheManagerWorklistList: ManagerWorklistList,
			onTheManagerWorklistObjectPage: ManagerWorklistObjectPage
        },
        async: true
    });

    return runner;
});

