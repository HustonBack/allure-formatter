
var Allure = require('allure-js-commons');
var allure = new Allure();

var currentSuite = {};
var currentCase = {};
var currentStep = {};
var currentLocation = null;
var currentStepIndex = null;
var lastCaseLocation = null;

function setCurrentStep (index){
    return currentCase.steps[index];
}

function setCurrentCase(location) {
    var currentScenario = null;
    currentSuite.scenarios.forEach(
        function (scenario) {
            if(scenario.type === 'Scenario'){
                if (scenario.location === location) {
                    currentScenario = scenario;
                }
            }else {
                var i = 1;
                scenario.location.forEach(
                    function (locationItem) {
                        if(locationItem === location){
                            currentScenario = JSON.parse(JSON.stringify(scenario));
                            currentScenario.name = currentScenario.name + ' Raw #' + i;
                        }
                        i++;
                    }
                )
            }
        }
    );
    return currentScenario;
}

function getScenarioOutlineLocations (item) {
    var locations = [];

    item.examples.forEach(
        function (example) {
            example.tableBody.forEach(
                function (item) {
                    locations.push(item.location.line);
                }
            )
        }
    );

    return locations;
}

function mapStepArguments ( argument ) {
    return argument.rows.map(
        function (raw) {
            return raw.cells.map(
                function (cell) {
                    return cell.value;
                }
            )
        }
    )
}

function  updateScenarioOutlineSteps (step, currentStepData) {
    step.text = currentStepData.gherkinKeyword + ' ' + currentStepData.pickleStep.text;
    if (step.argument) {
        step.argument = mapStepArguments(currentStepData.pickleStep.arguments[0]);
    }

    return step;
}

function setCurrentSuite(data) {

    var suite = {
        name : data.document.feature.name,
        scenarios: data.document.feature.children.map(
            function (item) {
                return {
                    name : item.name,
                    type : item.type,
                    location : item.type === 'Scenario'
                        ? item.location.line
                        : getScenarioOutlineLocations(item),
                    steps : item.steps.map(
                        function (step) {
                            return {
                                text : step.keyword + ' ' + step.text,
                                argument: step.argument
                                    ? mapStepArguments(step.argument)
                                    : null
                            }
                        }
                    )
                }
            }
        )
    };
    var lastCase = suite.scenarios[suite.scenarios.length - 1];
    lastCaseLocation = lastCase.type === 'ScenarioOutline'
        ? lastCase.location[lastCase.location.length - 1]
        : lastCase.location;
    return suite;
}

function CustomFormatter (options) {

    options.eventBroadcaster.on('gherkin-document', function(data){
        currentSuite = setCurrentSuite(data);
        allure.startSuite(currentSuite.name);
    });

    options.eventBroadcaster.on('test-case-started', function(data){
        currentLocation = data.sourceLocation.line;
        currentCase = setCurrentCase(currentLocation);
        allure.startCase(currentCase.name);
    });

    options.eventBroadcaster.on('test-step-started', function(data){
        currentStepIndex = data.index;
        currentStep = setCurrentStep(currentStepIndex);
        if (currentCase.type === 'ScenarioOutline') {
            currentStep = updateScenarioOutlineSteps(currentStep, options.eventDataCollector.getTestStepData(data))
        }
        allure.startStep(currentStep.text);
        if (currentStep.argument) {
            var rawTable = currentStep.argument;
            var cellLength = [];
            var result = '';

            for (var column = 0; column < rawTable[0].length; column++){
                cellLength[column] = 0;
                for (var row = 0; row < rawTable.length; row++){
                    if (cellLength[column] < rawTable[row][column].length) {
                        cellLength[column] = rawTable[row][column].length;
                    }
                }
            }

            for (var row =0; row < rawTable.length; row++){
                result += "| ";
                for (var column = 0; column < rawTable[row].length; column++){
                    result += rawTable[row][column];
                    for (var i =0; i < (cellLength[column] - rawTable[row][column].length); i++){
                        result += ' ';
                    }
                    result += " |";
                }
                result += "\n";
            }

            allure.addAttachment('Step: \"' + currentStep.text + '\" dataTable', result, 'text/plain');
        }
    });

    options.eventBroadcaster.on('test-step-finished', function(data){
        allure.endStep(data.result.status);
    });

    options.eventBroadcaster.on('test-case-finished', function(data){
        if(data.result.status === 'failed') {
            allure.endCase(data.result.status, data.result.exception);
        } else {
            allure.endCase(data.result.status);
        }
        if (currentLocation === lastCaseLocation) {
            allure.endSuite()
        }
    });

}

module.exports = CustomFormatter;