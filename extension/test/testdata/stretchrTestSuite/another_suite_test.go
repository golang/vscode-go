package main_test

func (suite *ExampleTestSuite) TestExampleInAnotherFile() {
	if suite.VariableThatShouldStartAtFive != 5 {
		suite.T().Fatalf("%d != %d", 5, suite.VariableThatShouldStartAtFive)
	}
}
