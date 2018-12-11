import { lang } from '../index'

const xstate = lang`
  Machine     = Rule+
  InitRule    = ".->" EffectGroup
  Rule        = EventGroup "->" EffectGroup
              | %identifier "{" Machine "}"
              | Pragma
  EventGroup  = Condition* Event Condition* | Condition+
  Condition   = MachineState
  Event       = EventType
              | "."       # init event 
  EffectGroup = MachineState
              | SubMachine ("*" SubMachine)+
              | %function

  MachineState = "." (%identifier | %string)
  EventType    = "@" (%identifier | %string)

  Assignment = %identifier "=" SubMachine
  SubMachine = "{" Machine "}"
             | %identifier
             | %interpolatedMachine
  Pragma     = "%" "history" %identifier ("->" EffectGroup)?
`

const lightMachine = xstate`
  .-> .green
  .green @TIMER -> .yellow
  .yellow @TIMER -> .red
  .red @TIMER -> .green
`

const pedestrianStates = xstate`
  .-> .walk
  .walk @PED_TIMER -> .wait
  .wait @PED_TIMER -> .stop
`

const lightMachine2 = xstate`
  .-> .green
  .green @TIMER -> .yellow
  .yellow @TIMER -> .red
  .red @TIMER -> .green
  .red -> ${pedestrianStates}
`

const wordMachine = xstate`
  .-> bold * list
  bold = {
    .-> off
    .on @TOGGLE_BOLD -> .off
    .off @TOGGLE_BOLD -> .on
  }
  list = {
    .-> .none
    @BULLETS -> .bullets
    @NUMBERS -> .numbers
    @NONE -> .none 
  }
`

const fanMachine = xstate`
  .-> .fanOff
  .fanOff @POWER -> .fanOn.low
  .fanOff @HIGH_POWER -> .fanOn.high
  .fanOn @POWER -> .fanOff
  
  .fanOn -> {
    %history low
    %history high -> .third
    .-> .first
    .first @SWITCH -> .second
    .second @SWITCH -> .third
  }
`
