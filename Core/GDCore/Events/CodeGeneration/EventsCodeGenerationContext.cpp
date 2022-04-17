/*
 * GDevelop Core
 * Copyright 2008-2016 Florian Rival (Florian.Rival@gmail.com). All rights
 * reserved. This project is released under the MIT License.
 */
#include "GDCore/Events/CodeGeneration/EventsCodeGenerationContext.h"

#include <set>

#include "GDCore/CommonTools.h"
#include "GDCore/Events/CodeGeneration/EventsCodeGenerator.h"
#include "GDCore/Events/Tools/EventsCodeNameMangler.h"

using namespace std;

namespace gd {

void EventsCodeGenerationContext::InheritsFrom(
    const EventsCodeGenerationContext& parent_) {
  parent = &parent_;

  // Objects lists declared by parent became "already declared" in the child
  // context.
  alreadyDeclaredObjectsLists = parent_.alreadyDeclaredObjectsLists;
  std::copy(parent_.objectsListsToBeDeclared.begin(),
            parent_.objectsListsToBeDeclared.end(),
            std::inserter(alreadyDeclaredObjectsLists,
                          alreadyDeclaredObjectsLists.begin()));
  std::copy(parent_.objectsListsWithoutPickingToBeDeclared.begin(),
            parent_.objectsListsWithoutPickingToBeDeclared.end(),
            std::inserter(alreadyDeclaredObjectsLists,
                          alreadyDeclaredObjectsLists.begin()));
  std::copy(parent_.emptyObjectsListsToBeDeclared.begin(),
            parent_.emptyObjectsListsToBeDeclared.end(),
            std::inserter(alreadyDeclaredObjectsLists,
                          alreadyDeclaredObjectsLists.begin()));

  nearestAsyncParent = parent_.nearestAsyncParent;
  asyncDepth = parent_.asyncDepth;
  depthOfLastUse = parent_.depthOfLastUse;
  customConditionDepth = parent_.customConditionDepth;
  contextDepth = parent_.GetContextDepth() + 1;
  if (parent_.maxDepthLevel) {
    maxDepthLevel = parent_.maxDepthLevel;
    *maxDepthLevel = std::max(*maxDepthLevel, contextDepth);
  }
}

void EventsCodeGenerationContext::InheritsAsAsyncCallbackFrom(
    const EventsCodeGenerationContext& parent_) {
  parent = &parent_;
  nearestAsyncParent = this;
  asyncDepth = parent_.asyncDepth + 1;
  depthOfLastUse = parent_.depthOfLastUse;
  customConditionDepth = parent_.customConditionDepth;
  contextDepth = parent_.GetContextDepth() + 1;
  if (parent_.maxDepthLevel) {
    maxDepthLevel = parent_.maxDepthLevel;
    *maxDepthLevel = std::max(*maxDepthLevel, contextDepth);
  }
}

void EventsCodeGenerationContext::Reuse(
    const EventsCodeGenerationContext& parent_) {
  InheritsFrom(parent_);
  if (parent_.CanReuse())
    contextDepth = parent_.GetContextDepth();  // Keep same context depth
}

void EventsCodeGenerationContext::ObjectsListNeeded(
    const gd::String& objectName) {
  if (!IsToBeDeclared(objectName)) {
    objectsListsToBeDeclared.insert(objectName);
    if (IsAsync()) {
      for (gd::EventsCodeGenerationContext* asyncContext = nearestAsyncParent;
           asyncContext != NULL;
           asyncContext = asyncContext->parent->nearestAsyncParent)
        asyncContext->allObjectsListToBeDeclaredAcrossChildren.insert(objectName);
    }
  }

  depthOfLastUse[objectName] = GetContextDepth();
}

void EventsCodeGenerationContext::ObjectsListWithoutPickingNeeded(
    const gd::String& objectName) {
  if (!IsToBeDeclared(objectName))
    objectsListsWithoutPickingToBeDeclared.insert(objectName);

  depthOfLastUse[objectName] = GetContextDepth();
}

void EventsCodeGenerationContext::EmptyObjectsListNeeded(
    const gd::String& objectName) {
  if (!IsToBeDeclared(objectName))
    emptyObjectsListsToBeDeclared.insert(objectName);

  depthOfLastUse[objectName] = GetContextDepth();
}

std::set<gd::String> EventsCodeGenerationContext::GetAllObjectsToBeDeclared()
    const {
  std::set<gd::String> allObjectListsToBeDeclared(
      objectsListsToBeDeclared.begin(), objectsListsToBeDeclared.end());
  allObjectListsToBeDeclared.insert(
      objectsListsWithoutPickingToBeDeclared.begin(),
      objectsListsWithoutPickingToBeDeclared.end());
  allObjectListsToBeDeclared.insert(emptyObjectsListsToBeDeclared.begin(),
                                    emptyObjectsListsToBeDeclared.end());

  return allObjectListsToBeDeclared;
}

unsigned int EventsCodeGenerationContext::GetLastDepthObjectListWasNeeded(
    const gd::String& name) const {
  if (depthOfLastUse.count(name) != 0) return depthOfLastUse.find(name)->second;

  std::cout << "WARNING: During code generation, the last depth of an object "
               "list was 0."
            << std::endl;
  return 0;
}

bool EventsCodeGenerationContext::IsSameObjectsList(
    const gd::String& objectName,
    const EventsCodeGenerationContext& otherContext) const {
  return GetLastDepthObjectListWasNeeded(objectName) ==
         otherContext.GetLastDepthObjectListWasNeeded(objectName);
}

bool EventsCodeGenerationContext::ShouldUseAsyncObjectsLists(
    const gd::String& objectName) const {
  if (!IsAsync()) return false;
  std::cout << "test"<< objectName <<", starting from" << this << std::endl;
  for (gd::EventsCodeGenerationContext* asyncContext = nearestAsyncParent;
       asyncContext != NULL;  // Should never happen, but there just in case.
       asyncContext = asyncContext->parent->nearestAsyncParent) {
  std::cout << "parent:" << asyncContext << std::endl;
    if (asyncContext->ObjectAlreadyDeclaredByParents(objectName)) {
  std::cout << "true, declared in this async context" << std::endl;
      return true;
    }
    // When reaching the last asynchronous context, check the parent synchronous
    // context before returning.
    if (!asyncContext->parent->IsAsync()) {
      std::cout << "parent is not async, object already declared:" << asyncContext->parent->ObjectAlreadyDeclaredByParents(objectName) << std::endl;
      return asyncContext->parent->ObjectAlreadyDeclaredByParents(objectName);
    }
  }
  return false;
};

}  // namespace gd
