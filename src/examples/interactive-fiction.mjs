import { grammar } from '../index'

const withIndex = (xs) => xs.map((x, index) => ({ ...x, index }))

const story = grammar`
  Story   = Scene ++ line
            : ${(scenes) => new Story(scenes)}
  Scene   = Heading (line Body) (line Choice ++ line)
            : ${(id, body, choices) => ({ id, body, choices: withIndex(choices) })}
  Heading = "===" SceneID "===" 
            : ${(_, sceneID) => sceneID}
  Body    = value
  Choice  = ("*" value) (line? "->" SceneID) 
            : ${(label, sceneID) => ({ label, sceneID })}
  SceneID = identifier | value
`

class Story {
  constructor (scenes) {
    this._createSceneMap(scenes)
    this._firstSceneID = scenes[0].id
    this.resetStory()
  }
  get scene () {
    return this._sceneMap[this._sceneID]
  }
  resetStory () {
    this._sceneID = this._firstSceneID
    return this
  }
  choose (index) {
    const choices = this.scene.choices
    if (!(index in choices)) {
      throw new Error(`Invalid choice ${index}`)
    }
    const choice = choices[index]
    this._sceneID = choice.sceneID
    return this
  }
  _createSceneMap (scenes) {
    this._sceneMap = {}
    for (const scene of scenes) {
      if (scene.id in this._sceneMap) {
        throw new Error(`Duplicate scenes with ID ${scene.id}`)
      }
      this._sceneMap[scene.id] = scene
    }
  }
}

export function test_interactive_fiction (expect) {
  // from https://twitter.com/leonscoolgame
  const leonAdventure = story`
    === begin ===
    "You wake up, unfortunately. There is a treasure chest in the room. You do not know where it came from."
    * "open treasure chest" -> treasure
    * "pet cat" -> cat
    * "go to the bathroom" -> toilet
    === cat ===
    "The cat purrs with approval at your touch."
    * "open treasure chest" -> treasure
    * "pet cat" -> cat
    * "go to the bathroom" -> toilet

    === toilet ===
    "You walk into the bathroom. It smells like gingerbread cookies and cat litter. You have to pee."
    * "sit down to pee" -> toilet_sit
    * "stand up to pee" -> toilet_stand
    === toilet_stand ===
    "You stand in front of the toilet to pee. You lose your balance, slip, and fall on the floor, splitting your head open. You are dead."
    * "GAME OVER" -> begin
    === toilet_sit ===
    "You sit down to pee, which is totally fine. Your house, your rules. It's just more comfortable. It's not a big deal."
    * "flush and return to the bedroom" -> begin_after_bathroom
    === begin_after_bathroom ===
    "Bladder now empty, you feel much better. The cat meows in protest. You forgot to wash your hands. Who cares. You're an adult."
    * "open treasure chest" -> treasure
    * "pet cat" -> cat_after_bathroom
    === cat_after_bathroom ===
    "The cat purrs reluctantly. She sniffs suspiciously at your hands."
    * "open treasure chest" -> treasure

    === treasure ===
    "You open the treasure chest. It contains a sword! How typical. You wield it ironically though, so it's ok. Your phone rings."
    * "answer the phone" -> phone
    * "play around with the sword" -> sword
    === sword === 
    "You swing the sword and slash at the air. You look badd ass. You trip over the cat and impale yourself in the head. You are dead."
    * "GAME OVER" -> begin
    
    === phone ===
    "The rest of the game would continue from here."
    * "ok" -> begin
  `

  expect(leonAdventure.scene).toEqual({
    id: 'begin',
    body: 'You wake up, unfortunately. There is a treasure chest in the room. You do not know where it came from.',
    choices: [
      { index: 0, label: 'open treasure chest', sceneID: 'treasure' },
      { index: 1, label: 'pet cat', sceneID: 'cat' },
      { index: 2, label: 'go to the bathroom', sceneID: 'toilet' },
    ],
  })
  expect(leonAdventure.choose(2).scene).toEqual({
    id: 'toilet',
    body: 'You walk into the bathroom. It smells like gingerbread cookies and cat litter. You have to pee.',
    choices: [
      { index: 0, label: 'sit down to pee', sceneID: 'toilet_sit' },
      { index: 1, label: 'stand up to pee', sceneID: 'toilet_stand' },
    ],
  })
}
